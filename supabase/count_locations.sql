-- =====================================================================
-- จุดนับสต็อก — สินค้าหนึ่งรายการวางไว้หลายที่ (เช่น มัจฉะ: กระปุกหน้าบาร์ + ถุงใหญ่หลังร้าน)
--
--   item_count_locations      จุดนับของแต่ละสินค้า + น้ำหนักภาชนะของจุดนั้น + ยอดที่นับได้ล่าสุด
--   record_location_counts()  บันทึกยอดของจุดที่นับ แล้วตั้งยอดสินค้า = ผลรวมทุกจุด
--   add_purchase_to_location  (trigger) ของรับเข้า → บวกเข้า "จุดเก็บของรับเข้า" (เช่น หลังร้าน)
--
-- จุดนับมีไว้ช่วยหักภาชนะแล้วบวกรวม: จุดที่ไม่ได้นับในรอบนั้นใช้ยอดล่าสุดของจุดนั้น
-- ยอดของแต่ละจุดเป็นตัวช่วยคำนวณเบื้องหลัง ยอดจริงของสินค้ายังเป็น items.current_stock
-- สินค้าที่ไม่มีจุดนับ ทำงานแบบเดิม (ช่องเดียว หักภาชนะด้วย items.tare_weight)
-- วิธีรัน: วางทั้งไฟล์ใน Supabase SQL Editor แล้ว Run (รันซ้ำได้) — ต้องรัน supabase/inventory.sql มาก่อน
-- =====================================================================

begin;

create table if not exists public.item_count_locations (
  id              bigint generated always as identity primary key,
  item_id         bigint         not null references public.items (id) on delete cascade,
  name            text           not null check (btrim(name) <> ''),
  tare_weight     numeric(10, 2) not null default 0 check (tare_weight >= 0),  -- กรัม
  sort_order      integer        not null default 0,
  last_count      numeric(12, 3) check (last_count >= 0),  -- ยอดสุทธิล่าสุด (หน่วยเดียวกับสินค้า), null = ยังไม่เคยนับ
  last_counted_at timestamptz,
  created_at      timestamptz    not null default now(),
  unique (item_id, name)
);

-- จุดเก็บของรับเข้า (ไม่ได้ตั้ง = จุดสุดท้ายตามลำดับ)
alter table public.item_count_locations
  add column if not exists receives_purchases boolean not null default false;

create index if not exists item_count_locations_item_idx
  on public.item_count_locations (item_id, sort_order);

-- บันทึกการแก้ไขลง audit_log เหมือนตารางอื่น (ใครเพิ่ม/แก้ชื่อ/น้ำหนักภาชนะ/ลบจุด)
drop trigger if exists item_count_locations_audit on public.item_count_locations;
create trigger item_count_locations_audit after insert or update or delete on public.item_count_locations
  for each row execute function public.write_audit_log();

-- (รุ่นแรกของไฟล์นี้มี view สำหรับเตือน "มีรับเข้าหลังนับ" — เลิกใช้แล้ว เพราะของรับเข้าบวกเข้าจุดให้เอง)
drop view if exists public.v_item_count_locations;

-- ของรับเข้า (purchase) → บวกเข้าจุดเก็บของรับเข้า, ลบ movement รับเข้า (เช่น /ยกเลิกรับ) → หักออก
-- ทำให้วันที่นับแค่หน้าบาร์ ยอดหลังร้านที่ระบบจำไว้ยังรวมของที่เพิ่งรับเข้าด้วย
create or replace function public.add_purchase_to_location()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row public.stock_movements := case when tg_op = 'DELETE' then old else new end;
  v_qty numeric := case when tg_op = 'DELETE' then -old.quantity else new.quantity end;
begin
  if v_row.movement_type <> 'purchase' then
    return null;
  end if;

  update public.item_count_locations
     set last_count = greatest(coalesce(last_count, 0) + v_qty, 0)
   where id = (select l.id from public.item_count_locations l
                where l.item_id = v_row.item_id
                order by l.receives_purchases desc, l.sort_order desc, l.id desc
                limit 1);
  return null;
end $$;

drop trigger if exists stock_movements_purchase_location on public.stock_movements;
create trigger stock_movements_purchase_location after insert or delete on public.stock_movements
  for each row execute function public.add_purchase_to_location();

-- p_counts: [{"location_id": 1, "count": 120.5}, ...] — เฉพาะจุดที่นับในรอบนี้ (ยอดสุทธิหลังหักภาชนะแล้ว)
create or replace function public.record_location_counts(
  p_item_id bigint,
  p_counts  jsonb,
  p_note    text default 'นับสต็อก (หน้านับสต็อก)'
) returns numeric
language plpgsql security invoker set search_path = '' as $$
declare
  v_entry  jsonb;
  v_count  numeric;
  v_total  numeric;
  v_detail text;
  v_ids    bigint[];
begin
  if p_counts is null or jsonb_typeof(p_counts) <> 'array' or jsonb_array_length(p_counts) = 0 then
    raise exception 'ไม่มียอดนับของจุดใดเลย';
  end if;

  -- ล็อกสินค้าไว้ก่อน กันนับซ้อนกันสองเครื่อง
  perform 1 from public.items where id = p_item_id for update;
  if not found then
    raise exception 'ไม่พบสินค้า id %', p_item_id;
  end if;

  for v_entry in select * from jsonb_array_elements(p_counts) loop
    v_count := (v_entry ->> 'count')::numeric;
    if v_count is null or v_count < 0 then
      raise exception 'ยอดนับต้องเป็นตัวเลข >= 0';
    end if;

    update public.item_count_locations
       set last_count = v_count, last_counted_at = now()
     where id = (v_entry ->> 'location_id')::bigint and item_id = p_item_id;
    if not found then
      raise exception 'ไม่พบจุดนับ id % ของสินค้า id %', v_entry ->> 'location_id', p_item_id;
    end if;
  end loop;

  v_ids := array(select (e ->> 'location_id')::bigint from jsonb_array_elements(p_counts) e);

  select coalesce(sum(coalesce(l.last_count, 0)), 0),
         string_agg(
           l.name || ' ' || coalesce(trim_scale(l.last_count)::text, '-') ||
             case when l.id = any(v_ids) then '' else ' (เดิม)' end,
           ', ' order by l.sort_order, l.id)
    into v_total, v_detail
    from public.item_count_locations l
   where l.item_id = p_item_id;

  perform public.record_stock_count(p_item_id, v_total, coalesce(p_note, 'นับสต็อก') || ': ' || v_detail);
  return v_total;
end $$;

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

revoke all on public.item_count_locations   from anon;
revoke execute on function public.record_location_counts(bigint, jsonb, text) from public, anon;
grant  execute on function public.record_location_counts(bigint, jsonb, text) to authenticated;

commit;
