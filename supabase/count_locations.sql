-- =====================================================================
-- จุดนับสต็อก — สินค้าหนึ่งรายการวางไว้หลายที่ (เช่น มัจฉะ: กระปุกหน้าบาร์ + ถุงใหญ่หลังร้าน)
--
--   item_count_locations   ชื่อจุดนับของแต่ละสินค้า + น้ำหนักภาชนะของจุดนั้น
--
-- จุดนับเป็นแค่ตัวช่วยคิดเลขในหน้า /count: กรอกน้ำหนักแต่ละจุด → หักภาชนะของจุดนั้น → รวมกันเป็นยอดสต็อก
-- ระบบไม่จำยอดของแต่ละจุด ยอดจริงมีที่เดียวคือ items.current_stock (ของรับเข้าก็บวกเข้ายอดสต็อกตรงๆ)
-- สินค้าที่ไม่มีจุดนับ ทำงานแบบเดิม (ช่องเดียว หักภาชนะด้วย items.tare_weight)
-- วิธีรัน: วางทั้งไฟล์ใน Supabase SQL Editor แล้ว Run (รันซ้ำได้) — ต้องรัน supabase/inventory.sql มาก่อน
-- (ถ้าเคยรันไฟล์นี้รุ่นเก่าที่จำยอดรายจุด ไฟล์นี้จะลบคอลัมน์/trigger/function ของรุ่นนั้นออกให้
--  ชื่อจุดกับน้ำหนักภาชนะที่ตั้งไว้แล้วยังอยู่ครบ)
-- =====================================================================

begin;

create table if not exists public.item_count_locations (
  id              bigint generated always as identity primary key,
  item_id         bigint         not null references public.items (id) on delete cascade,
  name            text           not null check (btrim(name) <> ''),
  tare_weight     numeric(10, 2) not null default 0 check (tare_weight >= 0),  -- กรัม
  sort_order      integer        not null default 0,
  created_at      timestamptz    not null default now(),
  unique (item_id, name)
);

create index if not exists item_count_locations_item_idx
  on public.item_count_locations (item_id, sort_order);

-- บันทึกการแก้ไขลง audit_log เหมือนตารางอื่น (ใครเพิ่ม/แก้ชื่อ/น้ำหนักภาชนะ/ลบจุด)
drop trigger if exists item_count_locations_audit on public.item_count_locations;
create trigger item_count_locations_audit after insert or update or delete on public.item_count_locations
  for each row execute function public.write_audit_log();

-- ลบของรุ่นเก่าที่จำยอดรายจุด (ยอดล่าสุดของจุด, จุดเก็บของรับเข้า, trigger บวกของรับเข้าเข้าจุด)
drop view if exists public.v_item_count_locations;
drop trigger if exists stock_movements_purchase_location on public.stock_movements;
drop function if exists public.add_purchase_to_location();
drop function if exists public.record_location_counts(bigint, jsonb, text);
alter table public.item_count_locations
  drop column if exists last_count,
  drop column if exists last_counted_at,
  drop column if exists receives_purchases;

-- สิทธิ์: เหมือนตารางอื่น — anon เข้าไม่ได้, ผู้ใช้ที่ล็อกอินอ่าน/เพิ่ม/แก้/ลบได้
alter table public.item_count_locations enable row level security;

drop policy if exists "item_count_locations: authenticated read"   on public.item_count_locations;
drop policy if exists "item_count_locations: authenticated insert" on public.item_count_locations;
drop policy if exists "item_count_locations: authenticated update" on public.item_count_locations;
drop policy if exists "item_count_locations: authenticated delete" on public.item_count_locations;
create policy "item_count_locations: authenticated read"   on public.item_count_locations for select to authenticated using (true);
create policy "item_count_locations: authenticated insert" on public.item_count_locations for insert to authenticated with check (true);
create policy "item_count_locations: authenticated update" on public.item_count_locations for update to authenticated using (true) with check (true);
create policy "item_count_locations: authenticated delete" on public.item_count_locations for delete to authenticated using (true);

revoke all on public.item_count_locations from anon;

commit;
