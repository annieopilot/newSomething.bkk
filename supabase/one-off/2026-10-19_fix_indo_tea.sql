-- =====================================================================
-- แก้ "ชาอินโด 500 G" วันที่ 19 ต.ค. 2026 ที่นับผิดเป็น 500 ถุง (จริงมี 1 ถุง)
--
-- ในระบบเดิมมี 2 รายการที่หักล้างกัน:
--   M_1792415186638558  19 ต.ค. 20:06  นับได้ 500  (ในเว็บ = +499)
--   M_1792496200815919  20 ต.ค. 18:36  นับได้ 1    (ในเว็บ = −499)
-- ลบทั้งคู่ → ยอดเป็น 1 ถุงตลอด ยอดปัจจุบันไม่เปลี่ยน
-- แล้วคำนวณยอดรายวันของชาอินโดวันที่ 19–20 ต.ค. ใหม่ (มูลค่าที่พุ่งเกือบ ฿75,000 จะหายไป)
--
-- สำรองรายการที่ลบไว้ใน _backup_indo_tea_fix_20261019 / รันซ้ำได้ (ถ้าแก้แล้วจะไม่ทำอะไร)
-- วิธีรัน: Supabase → SQL Editor → New query → วางทั้งไฟล์ → Run
-- =====================================================================

begin;

create table if not exists public._backup_indo_tea_fix_20261019 as
  select * from public.stock_movements where false;
alter table public._backup_indo_tea_fix_20261019 enable row level security;

do $$
declare
  v_item   bigint;
  v_before numeric;
  v_rows   int;
  v_sum    numeric;
begin
  select id, current_stock into v_item, v_before from public.items where legacy_id = 'P_1787384892023496';
  if v_item is null then
    raise exception 'ไม่พบ "ชาอินโด 500 G"';
  end if;

  select count(*), coalesce(sum(quantity), 0) into v_rows, v_sum
    from public.stock_movements
   where item_id = v_item
     and (note like '%M_1792415186638558%' or note like '%M_1792496200815919%');

  if v_rows = 0 then
    raise notice 'แก้ไปแล้ว ไม่ทำอะไร';
    return;
  end if;
  if v_rows <> 2 or v_sum <> 0 then
    raise exception 'เจอ % รายการ ผลรวม % (คาดว่า 2 รายการ ผลรวม 0) — หยุดไว้ก่อน', v_rows, v_sum;
  end if;

  insert into public._backup_indo_tea_fix_20261019
  select * from public.stock_movements
   where item_id = v_item
     and (note like '%M_1792415186638558%' or note like '%M_1792496200815919%');

  delete from public.stock_movements
   where item_id = v_item
     and (note like '%M_1792415186638558%' or note like '%M_1792496200815919%');

  if (select current_stock from public.items where id = v_item) <> v_before then
    raise exception 'ยอดปัจจุบันเปลี่ยน — ยกเลิก';
  end if;

  -- คำนวณยอดสิ้นวัน 19–20 ต.ค. ใหม่: ยอดปัจจุบัน − ผลรวมการเคลื่อนไหวหลังสิ้นวันนั้น
  update public.stock_daily_snapshots s
     set quantity    = q.qty,
         stock_value = round(q.qty * s.cost_per_unit, 2),
         status      = case when q.qty <= 0 then 'out' when q.qty <= s.reorder_point then 'low' else 'ok' end
    from (
      select d.snapshot_date,
             v_before - coalesce((
               select sum(m.quantity) from public.stock_movements m
                where m.item_id = v_item
                  and m.occurred_at >= ((d.snapshot_date + 1)::timestamp at time zone 'Asia/Bangkok')
             ), 0) as qty
        from (values (date '2026-10-19'), (date '2026-10-20')) as d(snapshot_date)
    ) q
   where s.item_id = v_item and s.snapshot_date = q.snapshot_date;

  raise notice 'แก้เสร็จ';
end $$;

commit;

-- ตรวจผล: วันที่ 19–20 ต.ค. ชาอินโดควรเหลือ 1 ถุง และมูลค่ารวมไม่พุ่ง
select s.snapshot_date, s.quantity as ชาอินโด_ถุง, t.total_value as มูลค่ารวมทั้งร้าน
  from public.stock_daily_snapshots s
  join public.items i on i.id = s.item_id and i.legacy_id = 'P_1787384892023496'
  join public.v_stock_daily_totals t on t.snapshot_date = s.snapshot_date
 where s.snapshot_date between '2026-10-18' and '2026-10-21'
 order by s.snapshot_date;
