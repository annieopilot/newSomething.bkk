-- =====================================================================
-- ลบตารางระบบเดิมที่ไม่ใช้แล้ว: supplies, stock, products
--
-- ⚠️ รันหลังจาก deploy แอปเวอร์ชันใหม่ (ที่อ่าน items / v_inventory) ขึ้น Vercel แล้วเท่านั้น
--    ถ้ารันก่อน แอปเวอร์ชันเก่าที่ยังออนไลน์อยู่จะพังทันที
-- ⚠️ ลบแล้วกู้คืนไม่ได้ ถ้าอยากเก็บไว้ดู ให้ Export CSV จาก Table Editor ก่อน
--    (ข้อมูลในตารางเหล่านี้เป็นสำเนาเก่า ข้อมูลปัจจุบันอยู่ใน items / stock_movements แล้ว)
-- =====================================================================

begin;

-- ตรวจก่อน: ถ้ายังไม่ได้สร้างตารางชุดใหม่ ให้หยุด
do $$
begin
  if to_regclass('public.items') is null or to_regclass('public.v_inventory') is null then
    raise exception 'ยังไม่มีตารางชุดใหม่ (items / v_inventory) — รัน supabase/inventory.sql ก่อน';
  end if;
end $$;

drop table if exists public.products;
drop table if exists public.stock;
drop table if exists public.supplies;

commit;

-- ตรวจผล: ควรเหลือแต่ตารางชุดใหม่ + ตารางของบอท
select c.relname as table_name,
       case c.relkind when 'r' then 'table' when 'v' then 'view' end as type
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'v')
order by c.relkind, c.relname;
