-- =====================================================================
-- ปุ่ม "ไม่ต้องเตือนเมื่อหมด" ต่อสินค้า  (รันใน Supabase SQL Editor หลัง inventory.sql — รันซ้ำได้)
--
-- items.alert_enabled = false → สินค้านี้ไม่ถูกแจ้งใน LINE (ทั้งแจ้งเตือนอัตโนมัติ stock-alert และคำสั่ง /สต็อก)
-- ทำที่ view v_stock_status จึงไม่ต้อง deploy Edge Function ใหม่
-- =====================================================================

alter table public.items add column if not exists alert_enabled boolean not null default true;

-- v_inventory: เพิ่มคอลัมน์ alert_enabled ต่อท้าย (create or replace เพิ่มคอลัมน์ท้ายสุดได้โดยไม่ต้อง drop view ที่พึ่งพา)
create or replace view public.v_inventory
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
  i.updated_by,
  i.alert_enabled
from public.items i
join public.units u                on u.code = i.unit_code
left join public.item_categories c on c.id = i.category_id
left join public.suppliers s       on s.id = i.default_supplier_id;

-- v_stock_status: ตัดสินค้าที่ปิดการเตือนออก (คอลัมน์คงเดิม — Edge Functions อ่านชื่อเหล่านี้)
create or replace view public.v_stock_status
with (security_invoker = true) as
select
  v.id::text               as product_id,
  v.name,
  v.sku,
  v.current_stock::numeric as quantity,
  v.reorder_point::numeric as reorder_point,
  v.status
from public.v_inventory v
where v.is_active and v.alert_enabled;

revoke all on public.v_inventory    from anon;
revoke all on public.v_stock_status from anon, authenticated;

-- ปิดเตือนแล้ว → ล้างสถานะ "แจ้งไปแล้ว" เพื่อให้เปิดเตือนกลับมาแล้วแจ้งได้ใหม่
delete from public.stock_alert_state s
using public.items i
where s.product_id = i.id::text and not i.alert_enabled;
