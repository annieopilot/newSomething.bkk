-- =====================================================================
-- นับสต็อกย้อนหลังของ 25 พ.ย. 2026 (ร้านลืมนับ) — แก้เฉพาะเว็บ ไม่แตะ Google Sheets
--   Hondurus: หน้าบาร์ 253 g − ภาชนะ 141 = 112, ในซอง 747 g − ภาชนะ 25 = 722 → 834 g
--   Guatemala → 4 kg, Laos → 2 kg
--   บันทึกเป็น movement "count" (ส่วนต่าง) เวลา 25 พ.ย. 23:59 แล้วคำนวณ snapshot 25–26 พ.ย. ใหม่
--   ยกเลิกถ้ามีรายการของ 3 ตัวนี้หลัง 25 พ.ย. 23:59 อยู่แล้ว (ส่วนต่างจะคิดผิด) หรือเคยรันแล้ว
-- =====================================================================
begin;

create temp table _c (item_id bigint, counted numeric, note text) on commit drop;
insert into _c values
  (22, 834, 'นับสต็อกย้อนหลัง 25 พ.ย.: หน้าบาร์ 112, ในซอง 722 (ชั่ง 253 / 747 g หักภาชนะ 141 / 25)'),
  (19, 4,   'นับสต็อกย้อนหลัง 25 พ.ย.'),
  (20, 2,   'นับสต็อกย้อนหลัง 25 พ.ย.');

do $$
declare r record; v_cur numeric; t timestamptz := '2026-11-25 23:59:00+07';
begin
  if exists (select 1 from public.stock_movements m join _c using (item_id) where m.occurred_at >= t) then
    raise exception 'มีรายการของสินค้าเหล่านี้หลัง 25 พ.ย. 23:59 แล้ว — ตรวจก่อน';
  end if;
  for r in select * from _c loop
    select current_stock into v_cur from public.items where id = r.item_id for update;
    if r.counted <> v_cur then
      insert into public.stock_movements (item_id, movement_type, quantity, note, occurred_at, created_at)
      values (r.item_id, 'count', r.counted - v_cur, r.note, t, now());
    end if;
  end loop;
  update public.item_count_locations set last_count = 112, last_counted_at = t where id = 1 and item_id = 22;
  update public.item_count_locations set last_count = 722, last_counted_at = t where id = 2 and item_id = 22;
end $$;

update public.stock_daily_snapshots s
   set quantity    = c.qty,
       stock_value = round(c.qty * s.cost_per_unit, 2),
       status      = case when c.qty <= 0 then 'out' when c.qty <= s.reorder_point then 'low' else 'ok' end,
       recorded_at = now()
  from (select s2.snapshot_date, s2.item_id,
               i.current_stock - coalesce((select sum(m.quantity) from public.stock_movements m
                  where m.item_id = s2.item_id
                    and m.occurred_at >= ((s2.snapshot_date + 1)::timestamp at time zone 'Asia/Bangkok')), 0) as qty
          from public.stock_daily_snapshots s2 join public.items i on i.id = s2.item_id
         where s2.snapshot_date between '2026-11-25' and '2026-11-26') c
 where s.snapshot_date = c.snapshot_date and s.item_id = c.item_id;

select i.name, i.current_stock, m.quantity as ส่วนต่าง, m.occurred_at
  from public.stock_movements m join public.items i on i.id = m.item_id
 where m.occurred_at = '2026-11-25 23:59:00+07' and m.movement_type = 'count';
commit;
