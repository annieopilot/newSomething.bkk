-- =====================================================================
-- Inventory v2 — โครงสร้างฐานข้อมูลสต็อก + บันทึกการแก้ไข (audit log)
--
--   units ─┐
--   item_categories ─┼─< items >── suppliers
--                    │     │
--                    │     └─< stock_movements   (ประวัติรับเข้า/ใช้/ขาย/เสีย/นับ)
--
--   audit_log  ← บันทึกอัตโนมัติทุกครั้งที่เพิ่ม/แก้/ลบ: ใคร เมื่อไหร่ ค่าเดิม → ค่าใหม่
--
-- หลักการ
--   • แก้ไขได้ทุกอย่าง (สินค้า, ยอดคงเหลือ, ประวัติสต็อก) และทุกการแก้ถูกบันทึกใน audit_log
--   • ยอดคงเหลือ = ผลรวมของ stock_movements เสมอ
--       - เพิ่ม/แก้/ลบ movement → ระบบปรับ items.current_stock ให้เอง
--       - แก้ items.current_stock ตรงๆ → ระบบสร้าง movement ชนิด 'count' (ส่วนต่าง) ให้เอง
--   • ไม่ลบสินค้าที่มีประวัติ ให้ตั้ง is_active = false
--   • ไม่แตะตารางเดิม supplies / stock / products (แอปเดิมยังใช้อยู่)
--
-- วิธีรัน: วางทั้งไฟล์ใน Supabase SQL Editor แล้ว Run (รันซ้ำได้ / อัปเกรดจากรุ่นก่อนได้)
--          จากนั้นรัน supabase/import_inventory.sql เพื่อนำเข้าข้อมูลจาก CSV
-- =====================================================================

begin;

-- ลบของรุ่นก่อนที่ไม่ใช้แล้ว
drop view  if exists public.v_stock_status;
drop view  if exists public.v_inventory;
drop view  if exists public.v_change_history;
drop table if exists public.inventory_items;
-- drop trigger ... on <ตาราง> จะ error ถ้ายังไม่มีตาราง จึงเช็กก่อน
do $$
begin
  if to_regclass('public.stock_movements') is not null then
    drop trigger if exists stock_movements_immutable on public.stock_movements;
  end if;
  if to_regclass('public.items') is not null then
    drop trigger if exists items_guard_stock on public.items;
    drop trigger if exists items_set_updated_at on public.items;
  end if;
  if to_regclass('public.suppliers') is not null then
    drop trigger if exists suppliers_set_updated_at on public.suppliers;
  end if;
end $$;
drop function if exists public.prevent_ledger_change();
drop function if exists public.guard_item_stock();

-- ---------------------------------------------------------------------
-- 1) หน่วยนับ: code ภาษาอังกฤษสำหรับระบบ + ชื่อไทยสำหรับแสดงผล
-- ---------------------------------------------------------------------
create table if not exists public.units (
  code    text primary key check (code ~ '^[a-z_]+$'),
  name_th text not null unique,
  name_en text not null,
  kind    text not null check (kind in ('mass', 'volume', 'count'))
);

insert into public.units (code, name_th, name_en, kind) values
  ('g',      'กรัม',      'gram',       'mass'),
  ('kg',     'กิโลกรัม',   'kilogram',   'mass'),
  ('ml',     'มิลลิลิตร',  'millilitre', 'volume'),
  ('l',      'ลิตร',      'litre',      'volume'),
  ('piece',  'ชิ้น',       'piece',      'count'),
  ('each',   'ใบ',        'each',       'count'),
  ('strand', 'เส้น',       'strand',     'count'),
  ('sheet',  'แผ่น',       'sheet',      'count'),
  ('bag',    'ถุง',        'bag',        'count'),
  ('bottle', 'ขวด',       'bottle',     'count'),
  ('box',    'กล่อง',      'box',        'count'),
  ('can',    'กระป๋อง',    'can',        'count'),
  ('gallon', 'แกลลอน',    'gallon',     'count'),
  ('pack',   'ห่อ',        'pack',       'count'),
  ('roll',   'ม้วน',       'roll',       'count')
on conflict (code) do update
  set name_th = excluded.name_th, name_en = excluded.name_en, kind = excluded.kind;

-- ---------------------------------------------------------------------
-- 2) หมวดสินค้า และ ผู้ขาย
-- ---------------------------------------------------------------------
create table if not exists public.item_categories (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  contact    text,
  phone      text,
  notes      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3) สินค้า/วัตถุดิบ
-- ---------------------------------------------------------------------
create table if not exists public.items (
  id                  bigint generated always as identity primary key,
  sku                 text unique,                        -- รหัสที่คนใช้ (เลข 1..45 จากระบบเดิม)
  name                text not null,
  category_id         bigint references public.item_categories (id) on delete set null,
  unit_code           text not null references public.units (code),   -- หน่วยที่นับสต็อก
  cost_per_unit       numeric(12, 4) not null default 0 check (cost_per_unit >= 0),
  reorder_point       numeric(12, 3) not null default 0 check (reorder_point >= 0),  -- เหลือ <= ค่านี้ = ใกล้หมด
  reorder_qty         numeric(12, 3) check (reorder_qty > 0),         -- (ไม่บังคับ) สั่งครั้งละเท่าไหร่
  purchase_unit_code  text references public.units (code),            -- (ไม่บังคับ) หน่วยตอนซื้อ เช่น ถุง
  purchase_pack_size  numeric(12, 3) check (purchase_pack_size > 0),  -- 1 หน่วยซื้อ = กี่หน่วยนับ
  default_supplier_id bigint references public.suppliers (id) on delete set null,
  current_stock       numeric(12, 3) not null default 0,  -- แก้ได้: ระบบสร้าง movement 'count' ให้อัตโนมัติ
  is_active           boolean not null default true,
  notes               text,
  legacy_id           text unique,                        -- product_id ของระบบเดิม (P_...) ใช้จับคู่ตอนนำเข้า CSV
  created_at          timestamptz not null default now()
);

-- ฟีเจอร์ของแอป: บาร์โค้ด และน้ำหนักภาชนะเปล่า (ชั่งตัดภาชนะ / Tare)
alter table public.items add column if not exists barcode     text;
alter table public.items add column if not exists tare_weight numeric(10, 2) not null default 0
  check (tare_weight >= 0);

create index if not exists items_category_idx on public.items (category_id);
create index if not exists items_active_idx   on public.items (is_active);

-- ---------------------------------------------------------------------
-- 4) ประวัติสต็อก — quantity: บวก = เข้า, ลบ = ออก (หน่วยเดียวกับ items.unit_code)
-- ---------------------------------------------------------------------
create table if not exists public.stock_movements (
  id            bigint generated always as identity primary key,
  item_id       bigint not null references public.items (id) on delete restrict,
  movement_type text not null check (movement_type in
                  ('opening', 'purchase', 'usage', 'sale', 'waste', 'count', 'adjustment')),
  quantity      numeric(12, 3) not null check (quantity <> 0),
  unit_cost     numeric(12, 4) check (unit_cost >= 0),   -- ราคาต่อหน่วยตอนรับเข้า (purchase)
  note          text,
  occurred_at   timestamptz not null default now(),      -- เวลาที่เกิดจริง
  created_at    timestamptz not null default now(),      -- เวลาที่บันทึก
  constraint stock_movements_sign check (
       (movement_type in ('opening', 'purchase')    and quantity > 0)   -- รับเข้า
    or (movement_type in ('usage', 'sale', 'waste') and quantity < 0)   -- ใช้/ขาย/เสีย
    or  movement_type in ('count', 'adjustment')                        -- นับ/ปรับ: บวกหรือลบ
  )
);

create index if not exists stock_movements_item_time_idx
  on public.stock_movements (item_id, occurred_at desc);

-- คอลัมน์ "ใครสร้าง / ใครแก้ล่าสุด / แก้เมื่อไหร่" (add if not exists = อัปเกรดจากรุ่นก่อนได้)
do $$
declare t text;
begin
  foreach t in array array['item_categories', 'suppliers', 'items', 'stock_movements'] loop
    execute format('alter table public.%I add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null', t);
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('alter table public.%I add column if not exists updated_by uuid references auth.users (id) on delete set null', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5) Audit log — บันทึกอัตโนมัติ แก้/ลบไม่ได้
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id               bigint generated always as identity primary key,
  changed_at       timestamptz not null default now(),
  changed_by       uuid,                 -- auth.users.id ของผู้แก้ (null = แก้จาก SQL Editor / ระบบ)
  changed_by_email text,
  db_role          text,                 -- authenticated / service_role / postgres
  table_name       text not null,
  record_id        text not null,
  action           text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_fields   jsonb,                -- UPDATE: {"field": {"old": ..., "new": ...}}
  old_data         jsonb,
  new_data         jsonb
);

create index if not exists audit_log_record_idx on public.audit_log (table_name, record_id, changed_at desc);
create index if not exists audit_log_time_idx   on public.audit_log (changed_at desc);

-- ---------------------------------------------------------------------
-- 6) Triggers
-- ---------------------------------------------------------------------
-- updated_at / updated_by
create or replace function public.set_updated_meta()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['item_categories', 'suppliers', 'items', 'stock_movements'] loop
    execute format('drop trigger if exists %1$s_set_updated_meta on public.%1$I', t);
    execute format('create trigger %1$s_set_updated_meta before update on public.%1$I
                      for each row execute function public.set_updated_meta()', t);
  end loop;
end $$;
drop function if exists public.set_updated_at();

-- movement เปลี่ยน → ปรับยอด items
-- flag 'inventory.syncing' กันวนซ้ำระหว่าง trigger ของ items กับ stock_movements
create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('inventory.syncing', true) = 'on' then
    return null;  -- movement นี้ถูกสร้างจากการแก้ items.current_stock ตรงๆ ยอดถูกตั้งไว้แล้ว
  end if;

  perform set_config('inventory.syncing', 'on', true);
  if tg_op in ('UPDATE', 'DELETE') then
    update public.items set current_stock = current_stock - old.quantity where id = old.item_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.items set current_stock = current_stock + new.quantity where id = new.item_id;
  end if;
  perform set_config('inventory.syncing', 'off', true);
  return null;
end $$;

drop trigger if exists stock_movements_apply on public.stock_movements;
create trigger stock_movements_apply after insert or update or delete on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- แก้ items.current_stock ตรงๆ → สร้าง movement ส่วนต่างให้ ยอดกับประวัติจึงตรงกันเสมอ
create or replace function public.record_direct_stock_edit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_diff numeric;
begin
  if current_setting('inventory.syncing', true) = 'on' then
    return null;  -- การเปลี่ยนนี้มาจาก stock_movements อยู่แล้ว
  end if;

  v_diff := new.current_stock - case when tg_op = 'INSERT' then 0 else old.current_stock end;
  if v_diff = 0 then
    return null;
  end if;

  perform set_config('inventory.syncing', 'on', true);
  insert into public.stock_movements (item_id, movement_type, quantity, note, created_by)
  values (
    new.id,
    case when tg_op = 'INSERT' and v_diff > 0 then 'opening' else 'count' end,
    v_diff,
    case when tg_op = 'INSERT' then 'ยอดเริ่มต้นตอนเพิ่มสินค้า' else 'แก้ยอดคงเหลือโดยตรง' end,
    auth.uid()
  );
  perform set_config('inventory.syncing', 'off', true);
  return null;
end $$;

drop trigger if exists items_record_stock_edit on public.items;
create trigger items_record_stock_edit
  after insert or update of current_stock on public.items
  for each row execute function public.record_direct_stock_edit();

-- audit log: ใคร เมื่อไหร่ แก้อะไร
create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old     jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new     jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_changes jsonb;
  v_claims  jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_object('old', v_old -> k, 'new', v_new -> k))
      into v_changes
      from jsonb_object_keys(v_new) as k
     where k not in ('updated_at', 'updated_by')
       and (v_old -> k) is distinct from (v_new -> k);
    if v_changes is null then
      return null;  -- ไม่มีอะไรเปลี่ยนจริง
    end if;
    -- ยอดใน items ที่ระบบปรับตาม stock_movements: movement นั้นถูกบันทึกแล้ว ไม่ต้องบันทึกซ้ำ
    if tg_table_name = 'items'
       and current_setting('inventory.syncing', true) = 'on'
       and v_changes - 'current_stock' = '{}'::jsonb then
      return null;
    end if;
  end if;

  insert into public.audit_log
    (changed_by, changed_by_email, db_role, table_name, record_id, action, changed_fields, old_data, new_data)
  values (
    auth.uid(),
    v_claims ->> 'email',
    coalesce(v_claims ->> 'role', session_user),
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'code', v_old ->> 'code'),
    tg_op,
    v_changes,
    v_old,
    v_new
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['units', 'item_categories', 'suppliers', 'items', 'stock_movements'] loop
    execute format('drop trigger if exists %1$s_audit on public.%1$I', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I
                      for each row execute function public.write_audit_log()', t);
  end loop;
end $$;

-- audit log แก้/ลบไม่ได้ (แม้แต่ admin ใน SQL Editor ต้องปิด trigger นี้ก่อน)
create or replace function public.prevent_audit_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log แก้/ลบไม่ได้';
end $$;

drop trigger if exists audit_log_immutable on public.audit_log;
create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function public.prevent_audit_change();

-- ---------------------------------------------------------------------
-- 7) ฟังก์ชันนับสต็อก: ใส่ยอดที่นับได้ ระบบบันทึกส่วนต่างให้เอง
--    เรียกจากแอป: supabase.rpc('record_stock_count', { p_item_id: 1, p_counted: 12, p_note: 'นับสิ้นเดือน' })
--    (หรือจะ update items.current_stock ตรงๆ ก็ได้ ผลเหมือนกัน แต่ใส่หมายเหตุไม่ได้)
-- ---------------------------------------------------------------------
create or replace function public.record_stock_count(
  p_item_id bigint,
  p_counted numeric,
  p_note    text default null
) returns numeric
language plpgsql security invoker set search_path = '' as $$
declare
  v_current numeric;
begin
  if p_counted is null or p_counted < 0 then
    raise exception 'ยอดนับต้องเป็นตัวเลข >= 0';
  end if;

  select current_stock into v_current
    from public.items where id = p_item_id
    for update;
  if not found then
    raise exception 'ไม่พบสินค้า id %', p_item_id;
  end if;

  if p_counted <> v_current then
    insert into public.stock_movements (item_id, movement_type, quantity, note)
    values (p_item_id, 'count', p_counted - v_current, coalesce(p_note, 'นับสต็อก'));
  end if;
  return p_counted;
end $$;

-- ---------------------------------------------------------------------
-- 8) Views
-- ---------------------------------------------------------------------
-- ภาพรวมสต็อก (สำหรับแอป/รายงาน) — เทียบเท่า StockSummary.csv
create view public.v_inventory
with (security_invoker = true) as
select
  i.id,
  i.sku,
  i.name,
  c.name                                         as category,
  i.unit_code,
  u.name_th                                      as unit,
  i.current_stock,
  i.reorder_point,
  greatest(i.reorder_point - i.current_stock, 0) as suggested_order_qty,
  i.cost_per_unit,
  round(i.current_stock * i.cost_per_unit, 2)    as stock_value,
  s.name                                         as supplier,
  case
    when i.current_stock <= 0               then 'out'
    when i.current_stock <= i.reorder_point then 'low'
    else 'ok'
  end                                            as status,
  (select max(m.occurred_at) from public.stock_movements m where m.item_id = i.id) as last_movement_at,
  i.is_active,
  i.barcode,
  i.tare_weight,
  i.purchase_pack_size,
  i.notes,
  i.created_at,
  i.updated_at,
  i.updated_by
from public.items i
join public.units u                on u.code = i.unit_code
left join public.item_categories c on c.id = i.category_id
left join public.suppliers s       on s.id = i.default_supplier_id;

-- ประวัติการแก้ไข อ่านง่าย (เวลาไทย + ชื่อสินค้า)
create view public.v_change_history
with (security_invoker = true) as
select
  a.id,
  a.changed_at at time zone 'Asia/Bangkok'                 as changed_at_th,
  coalesce(a.changed_by_email, a.db_role)                  as changed_by,
  a.table_name,
  a.action,
  coalesce(
    case a.table_name
      when 'items'           then coalesce(a.new_data, a.old_data) ->> 'name'
      when 'stock_movements' then (select i.name from public.items i
                                    where i.id = (coalesce(a.new_data, a.old_data) ->> 'item_id')::bigint)
    end,
    coalesce(a.new_data, a.old_data) ->> 'name'
  )                                                        as item_name,
  a.changed_fields,
  a.record_id,
  a.changed_at
from public.audit_log a;

-- สัญญาข้อมูลของบอท LINE (คอลัมน์ต้องคงเดิม: Edge Functions อ่านชื่อเหล่านี้)
create view public.v_stock_status
with (security_invoker = true) as
select
  v.id::text               as product_id,
  v.name,
  v.sku,
  v.current_stock::numeric as quantity,
  v.reorder_point::numeric as reorder_point,
  v.status
from public.v_inventory v
where v.is_active;

-- ---------------------------------------------------------------------
-- 9) สิทธิ์ (RLS): anon เข้าไม่ได้, ผู้ใช้ที่ล็อกอินใช้งานได้, service role (Edge Function) ข้าม RLS
-- ---------------------------------------------------------------------
alter table public.units           enable row level security;
alter table public.item_categories enable row level security;
alter table public.suppliers       enable row level security;
alter table public.items           enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_log       enable row level security;

do $$
declare t text;
begin
  -- อ่านได้ทุกตาราง (รวม audit_log)
  foreach t in array array['units', 'item_categories', 'suppliers', 'items', 'stock_movements', 'audit_log'] loop
    execute format('drop policy if exists "%1$s: authenticated read" on public.%1$I', t);
    execute format('create policy "%1$s: authenticated read" on public.%1$I for select to authenticated using (true)', t);
  end loop;
  -- เพิ่ม/แก้ได้
  foreach t in array array['item_categories', 'suppliers', 'items', 'stock_movements'] loop
    execute format('drop policy if exists "%1$s: authenticated insert" on public.%1$I', t);
    execute format('create policy "%1$s: authenticated insert" on public.%1$I for insert to authenticated with check (true)', t);
    execute format('drop policy if exists "%1$s: authenticated update" on public.%1$I', t);
    execute format('create policy "%1$s: authenticated update" on public.%1$I for update to authenticated using (true) with check (true)', t);
  end loop;
  -- ลบได้: หมวด ผู้ขาย และประวัติสต็อก (สินค้าใช้ is_active = false แทนการลบ)
  foreach t in array array['item_categories', 'suppliers', 'stock_movements'] loop
    execute format('drop policy if exists "%1$s: authenticated delete" on public.%1$I', t);
    execute format('create policy "%1$s: authenticated delete" on public.%1$I for delete to authenticated using (true)', t);
  end loop;
end $$;

revoke all on public.audit_log        from anon;
revoke insert, update, delete, truncate on public.audit_log from authenticated;
revoke all on public.v_inventory      from anon;
revoke all on public.v_change_history from anon;
revoke all on public.v_stock_status   from anon, authenticated;
revoke execute on function public.record_stock_count(bigint, numeric, text) from public, anon;
grant  execute on function public.record_stock_count(bigint, numeric, text) to authenticated;

-- ล้างสถานะ "แจ้งไปแล้ว" ของรหัสรุ่นเก่า (supplies:/stock:/P_...) — รหัสใหม่คือ items.id
delete from public.stock_alert_state where product_id !~ '^[0-9]+$';

commit;
