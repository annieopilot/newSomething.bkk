-- =====================================================================
-- รวม "แก้วร้อนน" (sku 27, สร้างซ้ำเมื่อ 2 พ.ย.) เข้า "แก้วร้อน" (sku 270, ตัวเดิม) แล้วลบตัวซ้ำทิ้ง
--
-- ที่มา: ในระบบเดิม ประวัติของ "แก้วร้อน" (product_id 001) ถูกบันทึกเป็น product_id 1 จึงไม่ถูกนับ
--        ยอดเลยเป็น 0 ตลอด จนมีคนสร้าง "แก้วร้อนน" มารับเข้า 500 แทน
--
-- ทำอะไร:
--   1. สำรองประวัติของแก้วร้อนนไว้ใน _backup_hotcup_merge_20261107
--   2. ย้ายประวัติทั้งหมดของแก้วร้อนน → แก้วร้อน (ยอดย้อนหลังวันที่ 2–6 พ.ย. จึงยังมีแก้ว 500 ใบ)
--   3. ตั้งยอดแก้วร้อน = ยอดที่แก้ไว้ในเว็บแล้ว (ถ้ายังเป็น 0 ใช้ยอดของแก้วร้อนนแทน) — ไม่นับซ้ำ
--   4. สร้างยอดรายวันย้อนหลังของแก้วร้อนใหม่ + บันทึกยอดวันนี้ แล้วลบแก้วร้อนน
-- รันซ้ำได้: ถ้ารวมไปแล้วจะไม่ทำอะไร
-- วิธีรัน: Supabase → SQL Editor → New query → วางทั้งไฟล์ → Run
-- =====================================================================

begin;

drop table if exists public._backup_hotcup_merge_20261107;
create table public._backup_hotcup_merge_20261107 as
  select m.* from public.stock_movements m
    join public.items i on i.id = m.item_id
   where i.legacy_id in ('001', 'P_1793615352134481');
alter table public._backup_hotcup_merge_20261107 enable row level security;

do $$
declare
  v_keep       bigint;
  v_keep_stock numeric;
  v_dup        bigint;
  v_dup_stock  numeric;
  v_target     numeric;
  v_now_stock  numeric;
  v_today      date := (now() at time zone 'Asia/Bangkok')::date;
begin
  select id, current_stock into v_keep, v_keep_stock from public.items where legacy_id = '001';
  select id, current_stock into v_dup,  v_dup_stock  from public.items where legacy_id = 'P_1793615352134481';

  if v_keep is null then
    raise exception 'ไม่พบ "แก้วร้อน" (legacy_id 001)';
  end if;
  if v_dup is null then
    raise notice 'ไม่พบ "แก้วร้อนน" — น่าจะรวมไปแล้ว ไม่ทำอะไร';
    return;
  end if;

  -- ยอดสุดท้าย: ใช้ยอดที่แก้ในเว็บแล้ว ถ้ายังเป็น 0 ใช้ยอดของตัวซ้ำ
  v_target := case when v_keep_stock > 0 then v_keep_stock else v_dup_stock end;

  -- ย้ายประวัติ (trigger ย้ายยอดตามให้อัตโนมัติ)
  update public.stock_movements
     set item_id = v_keep,
         note    = concat_ws(' · ', note, 'ย้ายจาก "แก้วร้อนน"')
   where item_id = v_dup;

  -- ปรับยอดให้เท่ากับยอดสุดท้าย (กันนับซ้ำ)
  select current_stock into v_now_stock from public.items where id = v_keep;
  if v_now_stock <> v_target then
    insert into public.stock_movements (item_id, movement_type, quantity, note)
    values (v_keep, 'count', v_target - v_now_stock, 'รวม "แก้วร้อนน" เข้า "แก้วร้อน" (กันนับซ้ำ)');
  end if;

  -- ลบตัวซ้ำ (ยอดรายวันของตัวซ้ำถูกลบตามอัตโนมัติ)
  delete from public.items where id = v_dup;

  -- สร้างยอดรายวันย้อนหลังของแก้วร้อนใหม่จากประวัติ
  delete from public.stock_daily_snapshots where item_id = v_keep and snapshot_date < v_today;

  insert into public.stock_daily_snapshots
    (snapshot_date, item_id, item_name, sku, category, unit, quantity, cost_per_unit, stock_value,
     reorder_point, status, is_backfill)
  select c.snapshot_date, v.id, v.name, v.sku, v.category, v.unit, c.qty, v.cost_per_unit,
         round(c.qty * v.cost_per_unit, 2), v.reorder_point,
         case when c.qty <= 0 then 'out' when c.qty <= v.reorder_point then 'low' else 'ok' end, true
    from public.v_inventory v
    cross join lateral (
      select d::date as snapshot_date,
             v.current_stock - coalesce((
               select sum(m.quantity) from public.stock_movements m
                where m.item_id = v.id
                  and m.occurred_at >= ((d::date + 1)::timestamp at time zone 'Asia/Bangkok')
             ), 0) as qty
        from generate_series(
               (select (min(occurred_at) at time zone 'Asia/Bangkok')::date
                  from public.stock_movements where item_id = v.id),
               v_today - 1, interval '1 day') as d
    ) c
   where v.id = v_keep;

  perform public.take_stock_snapshot();
  raise notice 'รวมเสร็จ: แก้วร้อน = % ใบ', v_target;
end $$;

commit;

-- ตรวจผล
select name, sku, current_stock, stock_value from public.v_inventory where name like 'แก้วร้อน%';
select snapshot_date, total_value from public.v_stock_daily_totals order by snapshot_date desc limit 7;
