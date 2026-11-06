-- =====================================================================
-- ยอดสต็อกรายวัน — บันทึกยอดคงเหลือและมูลค่าของทุกสินค้าทุกคืน 23:59 (เวลาไทย)
--
--   stock_daily_snapshots   1 แถว = 1 สินค้า ต่อ 1 วัน (ประมาณ 55 แถว/วัน ≈ 3–4 MB/ปี)
--   v_stock_daily_totals    ยอดรวมของแต่ละวัน (มูลค่ารวม จำนวนรายการ ใกล้หมด/หมด)
--   take_stock_snapshot()   บันทึกยอดของวันนั้น (รันซ้ำได้: เขียนทับของวันเดียวกัน)
--
-- เก็บชื่อ/หมวด/หน่วย/ราคาต่อหน่วย ณ วันนั้นไว้ด้วย ถ้าแก้ชื่อหรือราคาภายหลัง ข้อมูลย้อนหลังจะไม่เปลี่ยน
-- วิธีรัน: วางทั้งไฟล์ใน Supabase SQL Editor แล้ว Run (รันซ้ำได้) — ต้องรัน supabase/inventory.sql มาก่อน
-- =====================================================================

begin;

create table if not exists public.stock_daily_snapshots (
  snapshot_date date           not null,                 -- วันที่ (เวลาไทย)
  item_id       bigint         not null references public.items (id) on delete cascade,
  item_name     text           not null,
  sku           text,
  category      text,
  unit          text,
  quantity      numeric(12, 3) not null,
  cost_per_unit numeric(12, 4) not null,
  stock_value   numeric(14, 2) not null,
  reorder_point numeric(12, 3) not null,
  status        text           not null check (status in ('ok', 'low', 'out')),
  is_backfill   boolean        not null default false,   -- true = คำนวณย้อนหลังจากประวัติ (มูลค่าใช้ราคาปัจจุบัน)
  recorded_at   timestamptz    not null default now(),
  primary key (snapshot_date, item_id)
);

create index if not exists stock_daily_snapshots_item_idx
  on public.stock_daily_snapshots (item_id, snapshot_date desc);

-- ยอดรวมรายวัน
create or replace view public.v_stock_daily_totals
with (security_invoker = true) as
select
  snapshot_date,
  count(*)                                   as item_count,
  sum(greatest(stock_value, 0))              as total_value,
  count(*) filter (where status = 'low')     as low_count,
  count(*) filter (where status = 'out')     as out_count,
  bool_or(is_backfill)                       as is_backfill,
  max(recorded_at)                           as recorded_at
from public.stock_daily_snapshots
group by snapshot_date;

-- บันทึกยอดของวันนี้ (เวลาไทย) จากยอดคงเหลือปัจจุบัน
create or replace function public.take_stock_snapshot(
  p_date date default (now() at time zone 'Asia/Bangkok')::date
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  insert into public.stock_daily_snapshots
    (snapshot_date, item_id, item_name, sku, category, unit,
     quantity, cost_per_unit, stock_value, reorder_point, status, is_backfill, recorded_at)
  select p_date, v.id, v.name, v.sku, v.category, v.unit,
         v.current_stock, v.cost_per_unit, v.stock_value, v.reorder_point, v.status, false, now()
    from public.v_inventory v
   where v.is_active
  on conflict (snapshot_date, item_id) do update set
    item_name     = excluded.item_name,
    sku           = excluded.sku,
    category      = excluded.category,
    unit          = excluded.unit,
    quantity      = excluded.quantity,
    cost_per_unit = excluded.cost_per_unit,
    stock_value   = excluded.stock_value,
    reorder_point = excluded.reorder_point,
    status        = excluded.status,
    is_backfill   = false,
    recorded_at   = excluded.recorded_at;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- สิทธิ์: ผู้ใช้ที่ล็อกอินอ่านได้อย่างเดียว / บันทึกได้เฉพาะ pg_cron และ service role
alter table public.stock_daily_snapshots enable row level security;
drop policy if exists "stock_daily_snapshots: authenticated read" on public.stock_daily_snapshots;
create policy "stock_daily_snapshots: authenticated read" on public.stock_daily_snapshots
  for select to authenticated using (true);

revoke all on public.stock_daily_snapshots from anon;
revoke insert, update, delete, truncate on public.stock_daily_snapshots from authenticated;
revoke all on public.v_stock_daily_totals from anon;
revoke execute on function public.take_stock_snapshot(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- เติมยอดย้อนหลังตั้งแต่วันแรกที่มีประวัติ จนถึงเมื่อวาน
--   ยอด ณ สิ้นวัน D = ยอดปัจจุบัน − ผลรวมการเคลื่อนไหวที่เกิดหลังวัน D
--   มูลค่าใช้ราคาต่อหน่วยปัจจุบัน (ไม่มีราคาย้อนหลัง) และทำเครื่องหมาย is_backfill = true
--   ไม่เขียนทับวันที่มียอดจริงแล้ว
-- ---------------------------------------------------------------------
with days as (
  select d::date as snapshot_date,
         ((d::date + 1)::timestamp at time zone 'Asia/Bangkok') as day_end
    from generate_series(
           (select (min(occurred_at) at time zone 'Asia/Bangkok')::date from public.stock_movements),
           (now() at time zone 'Asia/Bangkok')::date - 1,
           interval '1 day'
         ) as d
),
calc as (
  select d.snapshot_date, v.*,
         v.current_stock - coalesce((
           select sum(m.quantity) from public.stock_movements m
            where m.item_id = v.id and m.occurred_at >= d.day_end
         ), 0) as qty
    from days d
    cross join public.v_inventory v
   where v.is_active
     and exists (select 1 from public.stock_movements m
                  where m.item_id = v.id and m.occurred_at < d.day_end)
)
insert into public.stock_daily_snapshots
  (snapshot_date, item_id, item_name, sku, category, unit,
   quantity, cost_per_unit, stock_value, reorder_point, status, is_backfill)
select snapshot_date, id, name, sku, category, unit,
       qty, cost_per_unit, round(qty * cost_per_unit, 2), reorder_point,
       case when qty <= 0 then 'out' when qty <= reorder_point then 'low' else 'ok' end,
       true
  from calc
on conflict (snapshot_date, item_id) do nothing;

commit;

-- ---------------------------------------------------------------------
-- ตั้งเวลา: ทุกวัน 23:59 เวลาไทย (= 16:59 UTC) — ทำงานใน SQL ล้วน ไม่เรียก Edge Function
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
select cron.schedule('stock-snapshot-daily', '59 16 * * *', $$ select public.take_stock_snapshot() $$);

-- ตรวจผล:
--   select * from public.v_stock_daily_totals order by snapshot_date desc;
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'stock-snapshot-daily')
--     order by start_time desc limit 5;
-- ยกเลิกงาน:
--   select cron.unschedule('stock-snapshot-daily');
