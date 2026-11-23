-- =====================================================================
-- ปรับข้อมูลสินค้า + ยอดสต็อกในเว็บให้ตรงกับ Google Sheets ระบบเดิม (ชีต Products + StockSummary)
-- ดึงจากชีตเมื่อ 2026-11-13T09:44:54.320Z — ชีตไม่ถูกแก้ไข (อ่านอย่างเดียว)
--
-- ทำอะไร
--   - สินค้าที่มีในชีต: ชื่อ, sku, หมวด, หน่วย, ราคาทุน, จุดสั่งซื้อ, ผู้ขาย ให้ตรงกับชีต และเปิดใช้งาน
--     (ช่องที่ชีตเว้นว่าง เช่น sku / ผู้ขาย → คงค่าในเว็บไว้)
--   - สินค้าที่ยังไม่มีในเว็บ (เช่น BROOKIE) → เพิ่มใหม่
--     ถ้าในเว็บมีสินค้าชื่อเดียวกันที่สร้างในเว็บเอง (ไม่มี legacy_id) → ใช้ตัวนั้น ไม่สร้างซ้ำ
--   - ยอดสต็อก = current_stock ใน StockSummary (บันทึกเป็น movement "count" ไว้ดูย้อนหลังได้)
--   - ยึดชีตเป็นหลัก: สินค้าที่มีแต่ในเว็บ (ไม่มีในชีต) → ปิดใช้งาน
--     (ไม่ลบ ประวัติยังอยู่ เปิดกลับได้ด้วย is_active = true)
--   - ตรวจว่ามูลค่าคลังในเว็บ = 33846.61 บาท (ตามชีต) ไม่ตรง → ยกเลิกทั้งหมด
--   - บันทึกยอดรายวันของวันนี้ใหม่ ให้หน้าประวัติแสดงยอดหลังปรับ
--
-- กรณีพิเศษ (ดู docs/legacy-stock-excel.md)
--   - "แก้วร้อน" (001) = ยอดแก้วร้อน + ยอด "แก้วร้อนน" (P_1793615352134481) เพราะในเว็บรวมเป็นตัวเดียวแล้ว
--   - ข้าม: 002 (แถวว่าง), P_1793615352134481 "แก้วร้อนน" (รวมยอด 500 เข้าแก้วร้อนแล้ว)
--
-- ก่อนเปลี่ยน สำรอง items ไว้ใน _backup_items_20261113 / รายการที่เปลี่ยนเก็บไว้ใน _sync_log_20261113
-- รันซ้ำได้ (รอบสองจะไม่เปลี่ยนอะไรถ้าไม่มีอะไรต่าง) / ถ้าขั้นไหนผิดพลาด ทั้งหมดถูกยกเลิก
-- วิธีรัน: Supabase → SQL Editor → New query → วางทั้งไฟล์ → Run
-- ผลลัพธ์ที่แสดงท้ายสุด = รายการที่เปลี่ยน (ก่อน → หลัง)
-- =====================================================================

begin;

-- 0) สำรอง + ตารางบันทึกการเปลี่ยน (เปิด RLS ไม่มี policy = แอปมองไม่เห็น)
drop table if exists public._backup_items_20261113;
create table public._backup_items_20261113 as select * from public.items;
alter table public._backup_items_20261113 enable row level security;

drop table if exists public._sync_log_20261113;
create table public._sync_log_20261113 (
  seq bigint generated always as identity, legacy_id text, item text, field text, before text, after text
);
alter table public._sync_log_20261113 enable row level security;

-- 1) ข้อมูลจากชีต
create temp table _sheet (
  legacy_id text primary key, sku text, name text not null, category text, unit_th text not null,
  cost numeric not null, reorder_point numeric not null, supplier text, stock numeric not null, created_at timestamptz
) on commit drop;

insert into _sheet values
  ('001', null, 'แก้วร้อน', 'อุปกรณ์', 'ใบ', 5.45, 250, null, 500, '2026-08-25 10:13:56+07'),
  ('P_1787219611354781', '1', 'นมจืด Meiji Ray', 'วัตถุดิบ', 'แกลลอน', 98, 3, 'Makro', 9, '2026-08-20 16:53:31+07'),
  ('P_1787219795422556', '2', 'นมข้นหวาน', 'วัตถุดิบ', 'ถุง', 134, 1, 'Makro', 1, '2026-08-20 16:56:35+07'),
  ('P_1787223536248266', '3', 'นมข้นจืด 1L', 'วัตถุดิบ', 'ถุง', 66, 3, 'Makro', 6, '2026-08-20 17:58:56+07'),
  ('P_1787223899545441', '4', 'น้ำส้ม', 'วัตถุดิบ', 'ขวด', 90, 3, 'neighbor', 1, '2026-08-20 18:04:59+07'),
  ('P_1787229261134792', '5', 'นมโอ๊ต 1L', 'วัตถุดิบ', 'ขวด', 56, 3, 'Makro', 3, '2026-08-20 19:34:21+07'),
  ('P_1787229399929609', '6', 'ครีมแท้ 1L', 'วัตถุดิบ', 'กล่อง', 195, 1, 'Makro', 0, '2026-08-20 19:36:39+07'),
  ('P_1787229652301916', '7', 'โซดาเลม่อน tonic กระป๋อง', 'วัตถุดิบ', 'กระป๋อง', 14.5, 3, 'Makro', 7, '2026-08-20 19:40:52+07'),
  ('P_1787372461676245', '8', 'น้ำตาลคาราเมล', 'วัตถุดิบ', 'ถุง', 39, 2, 'ร้านค้าที่มีจำหน่าย', 4, '2026-08-22 11:21:01+07'),
  ('P_1787384892023496', '9', 'ชาอินโด 500 G', 'ชา', 'ถุง', 150, 2, 'ShopOnline', 2, '2026-08-22 14:48:12+07'),
  ('P_1787384965371200', '10', 'โซดา', 'วัตถุดิบ', 'ขวด', 6.4, 10, null, 16, '2026-08-22 14:49:25+07'),
  ('P_1787385040853482', '11', 'โกโกสูตร2 1000g', 'ชา', 'กรัม', 0.675, 300, 'ShopOnline', 810, '2026-08-22 14:50:40+07'),
  ('P_1787385263654941', '12', 'โกโก้ Dutch', 'ชา', 'กรัม', 0.65, 300, 'ShopOnline', 850, '2026-08-22 14:54:23+07'),
  ('P_1787386388755732', '13', 'มัทฉะNishio', 'ชา', 'กรัม', 10.95, 100, null, 171, '2026-08-22 15:13:08+07'),
  ('P_1787387098356136', '14', 'มัทฉะ Yame', 'ชา', 'กรัม', 5.9, 100, null, 932, '2026-08-22 15:24:58+07'),
  ('P_1787484442179381', '15', 'ครัวซองต์', 'Bakery', 'ชิ้น', 50, 10, 'BakingHome', 0, '2026-08-23 18:27:22+07'),
  ('P_1787484494705467', '16', 'ชิโอะปัง', 'Bakery', 'ชิ้น', 37, 15, 'Baking Home', 28, '2026-08-23 18:28:14+07'),
  ('P_1787485590406222', '17', 'ขวดโคบรูว', 'แพ็กกิ้ง', 'ขวด', 0, 20, null, 84, '2026-08-23 18:46:30+07'),
  ('P_1787620020257415', '18', 'Guatemala', 'กาแฟ', 'กิโลกรัม', 660, 3, null, 6, '2026-08-25 08:07:00+07'),
  ('P_1787620049599142', '19', 'Laos', 'กาแฟ', 'กิโลกรัม', 480, 3, null, 1, '2026-08-25 08:07:29+07'),
  ('P_1787620130107514', '20', 'Ethiopia Bench maji', 'กาแฟ', 'กรัม', 0, 500, null, 0, '2026-08-25 08:08:50+07'),
  ('P_1787620165699631', '21', 'Hondurus', 'กาแฟ', 'กรัม', 0.87, 500, null, 223, '2026-08-25 08:09:25+07'),
  ('P_1787626818483263', '22', 'Brazil', 'กาแฟ', 'กรัม', 0.65, 500, null, 313, '2026-08-25 10:00:18+07'),
  ('P_1787626917965483', '23', 'China', 'กาแฟ', 'กรัม', 0, 500, null, 0, '2026-08-25 10:01:57+07'),
  ('P_1787627110815920', '24', 'แก้วใส', 'อุปกรณ์', 'ใบ', 2.65, 300, null, 1000, '2026-08-25 10:05:10+07'),
  ('P_1787627140607431', '25', 'แก้วดำ', 'อุปกรณ์', 'ใบ', 2.65, 300, null, 750, '2026-08-25 10:05:40+07'),
  ('P_1787627317219396', '26', 'หลอด 100×50 แพ็ค', 'อุปกรณ์', 'เส้น', 0.116, 500, null, 1400, '2026-08-25 10:08:37+07'),
  ('P_1787627687959959', '28', 'ทิชชู่แห้ง', 'ทั่วไป', 'ห่อ', 10, 5, null, 13, '2026-08-25 10:14:47+07'),
  ('P_1787627714628757', '29', 'ทิชชู่เปียก', 'ทั่วไป', 'ห่อ', 34, 3, null, 2, '2026-08-25 10:15:14+07'),
  ('P_1787627805501911', '30', 'กระดาษใบเสร็จ', 'อุปกรณ์', 'ม้วน', 17, 5, null, 11, '2026-08-25 10:16:45+07'),
  ('P_1787627889882795', '31', 'ถุงหิ้วคู่', 'แพ็กกิ้ง', 'ใบ', 0.9, 30, null, 100, '2026-08-25 10:18:09+07'),
  ('P_1787627917673672', '32', 'ถุงหิ้วเดี่ยว', 'แพ็กกิ้ง', 'ใบ', 0.65, 30, null, 80, '2026-08-25 10:18:37+07'),
  ('P_1787627977187824', '33', 'ถุงซิปล็อค 1 kg 222 ใบ', 'แพ็กกิ้ง', 'ใบ', 0.57, 50, null, 70, '2026-08-25 10:19:37+07'),
  ('P_1787628047785293', '34', 'ถุงกระดาษ', 'แพ็กกิ้ง', 'ใบ', 1.15, 30, null, 107, '2026-08-25 10:20:47+07'),
  ('P_1787628085797113', '35', 'ถุงขยะถังใหญ่', 'แพ็กกิ้ง', 'ใบ', 5.55, 2, null, 30, '2026-08-25 10:21:25+07'),
  ('P_1787628178254922', '36', 'ถุงขยะถังเล็ก', 'แพ็กกิ้ง', 'ม้วน', 1, 5, null, 1, '2026-08-25 10:22:58+07'),
  ('P_1787628225171587', '37', 'ถุงใส่กากกาแฟ', 'แพ็กกิ้ง', 'ใบ', 2.2, 15, null, 22, '2026-08-25 10:23:45+07'),
  ('P_1787628316855782', '38', 'น้ำยาล้างจาน', 'ทั่วไป', 'แกลลอน', 130, 1, null, 1, '2026-08-25 10:25:16+07'),
  ('P_1788269200706407', '39', 'Ethiopia Sidamo', 'กาแฟ', 'กรัม', 0, 500, null, 0, '2026-09-01 20:26:40+07'),
  ('P_1791477075743628', '40', 'Orange cake', 'เค้ก', 'ชิ้น', 65, 5, null, 10, '2026-10-08 23:31:15+07'),
  ('P_1791477214590100', '41', 'Coconut Cake', 'เค้ก', 'ชิ้น', 65, 5, null, 3, '2026-10-08 23:33:34+07'),
  ('P_1791477281746229', '42', 'Chocolate cake.', 'เค้ก', 'ชิ้น', 75, 5, null, 7, '2026-10-08 23:34:41+07'),
  ('P_1791477538458164', '43', 'Blueberry cheesecake', 'เค้ก', 'ชิ้น', 65, 5, null, 20, '2026-10-08 23:38:58+07'),
  ('P_1791477609621750', '44', 'New york cheesecake', 'เค้ก', 'ชิ้น', 65, 5, null, 8, '2026-10-08 23:40:09+07'),
  ('P_1792324665297393', '45', 'กระดาษกันหก', 'แพ็กกิ้ง', 'แผ่น', 0.1, 100, null, 160, '2026-10-18 18:57:45+07'),
  ('P_1793699877128547', '101', 'ไซรัปบลูฮาวาย 760 ML', 'ไซรัป', 'ขวด', 78, 1, null, 1, '2026-11-03 16:57:57+07'),
  ('P_1793700067285104', '102', 'ไซรัปสตอเบอรี่ 760 ML', 'ไซรัป', 'ขวด', 78, 1, null, 1, '2026-11-03 17:01:07+07'),
  ('P_1793700794957336', '103', 'ไซรัปลิ้นจี่', 'ไซรัป', 'ขวด', 450, 1, null, 1, '2026-11-03 17:13:14+07'),
  ('P_1793700836203534', '104', 'ไซรัปเลม่อน', 'ไซรัป', 'ขวด', 450, 1, null, 1, '2026-11-03 17:13:56+07'),
  ('P_1793701229930930', '105', 'ไซรัปยูสุ 2 KG', 'ไซรัป', 'ขวด', 700, 1, null, 1, '2026-11-03 17:20:29+07'),
  ('P_1793701368731127', '106', 'ไซรับโมจิโต', 'ไซรัป', 'ขวด', 700, 1, null, 1, '2026-11-03 17:22:48+07'),
  ('P_1793701431828470', '107', 'ไซรัปพินาโคลาดา', 'ไซรัป', 'ขวด', 700, 1, null, 1, '2026-11-03 17:23:51+07'),
  ('P_1793701506503465', '108', 'ไซรัปบลูคูราโซ่', 'ไซรัป', 'ขวด', 450, 1, null, 1, '2026-11-03 17:25:06+07'),
  ('P_1793701556081315', '109', 'ไซรัปชาดำ', 'ไซรัป', 'ขวด', 600, 1, null, 1, '2026-11-03 17:25:56+07'),
  ('P_1794474036641877', '59', 'BROOKIE', 'Bakery', 'ชิ้น', 50, 5, null, 24, '2026-11-12 16:00:36+07');

-- หน่วยที่ไม่รู้จัก → หยุด
do $$
declare missing text;
begin
  select string_agg(distinct s.unit_th, ', ') into missing
    from _sheet s left join public.units u on u.name_th = s.unit_th where u.code is null;
  if missing is not null then raise exception 'ไม่รู้จักหน่วย: % — เพิ่มในตาราง public.units ก่อน', missing; end if;
end $$;

-- ผู้ขาย: ใช้ชื่อที่มีอยู่แล้วถ้าตรงกันเมื่อไม่สนช่องว่าง/ตัวพิมพ์ ("Baking Home" = "BakingHome")
update _sheet s set supplier = sp.name
  from public.suppliers sp
 where s.supplier is not null
   and lower(replace(sp.name, ' ', '')) = lower(replace(s.supplier, ' ', ''))
   and sp.name <> s.supplier;
insert into public.suppliers (name)
select distinct s.supplier from _sheet s
 where s.supplier is not null
   and not exists (select 1 from public.suppliers sp where lower(replace(sp.name, ' ', '')) = lower(replace(s.supplier, ' ', '')));

insert into public.item_categories (name)
select distinct category from _sheet where category is not null
on conflict (name) do nothing;

-- 2) สินค้าที่สร้างในเว็บเอง (ไม่มี legacy_id) ชื่อตรงกับชีต → ผูกกับชีต ไม่สร้างซ้ำ
with linked as (
  update public.items i set legacy_id = s.legacy_id
    from _sheet s
   where i.legacy_id is null
     and lower(btrim(i.name)) = lower(btrim(s.name))
     and not exists (select 1 from public.items x where x.legacy_id = s.legacy_id)
  returning i.legacy_id, i.name
)
insert into public._sync_log_20261113 (legacy_id, item, field, before, after)
select legacy_id, name, 'ผูกกับชีต', 'สร้างในเว็บ', legacy_id from linked;

-- 3) sku ที่ซ้ำกับสินค้าตัวอื่นในเว็บ → ไม่เปลี่ยน sku ตัวนั้น (บันทึกไว้ในผลลัพธ์)
alter table _sheet add column sku_taken_by text;
update _sheet s set sku_taken_by = i.name
  from public.items i
 where s.sku is not null and i.sku = s.sku and i.legacy_id is distinct from s.legacy_id;

-- 4) บันทึกสิ่งที่จะเปลี่ยน (ก่อน → หลัง)
insert into public._sync_log_20261113 (legacy_id, item, field, before, after)
select s.legacy_id, s.name, f.field, f.before, f.after
  from _sheet s
  join public.items i on i.legacy_id = s.legacy_id
  join public.units u on u.code = i.unit_code
  left join public.item_categories c on c.id = i.category_id
  left join public.suppliers sp on sp.id = i.default_supplier_id
 cross join lateral (values
   (1, 'ชื่อ',        i.name,                               s.name),
   (2, 'sku',         i.sku,                                case when s.sku_taken_by is null then s.sku end),
   (3, 'หมวด',        c.name,                               s.category),
   (4, 'หน่วย',       u.name_th,                            s.unit_th),
   (5, 'ราคาทุน',     trim_scale(i.cost_per_unit)::text,    trim_scale(s.cost)::text),
   (6, 'จุดสั่งซื้อ',  trim_scale(i.reorder_point)::text,    trim_scale(s.reorder_point)::text),
   (7, 'ผู้ขาย',      sp.name,                              s.supplier),
   (8, 'ใช้งาน',      case when i.is_active then 'ใช้' else 'ปิด' end, 'ใช้'),
   (9, 'ยอดสต็อก',    trim_scale(i.current_stock)::text,    trim_scale(s.stock)::text)
 ) f(ord, field, before, after)
 where f.after is not null and f.before is distinct from f.after
 order by s.name, f.ord;

insert into public._sync_log_20261113 (legacy_id, item, field, before, after)
select s.legacy_id, s.name, 'sku (ไม่เปลี่ยน)', i.sku, s.sku || ' ซ้ำกับ "' || s.sku_taken_by || '"'
  from _sheet s join public.items i on i.legacy_id = s.legacy_id
 where s.sku_taken_by is not null and i.sku is distinct from s.sku;

insert into public._sync_log_20261113 (legacy_id, item, field, before, after)
select s.legacy_id, s.name, 'เพิ่มสินค้าใหม่', null,
       concat_ws(' · ', s.category, s.unit_th, 'ยอด ' || trim_scale(s.stock)) ||
       case when s.sku_taken_by is not null then ' (sku ' || s.sku || ' ซ้ำกับ "' || s.sku_taken_by || '" — เว้นว่างไว้)' else '' end
  from _sheet s
 where not exists (select 1 from public.items i where i.legacy_id = s.legacy_id);

-- 5) อัปเดตสินค้าที่มีอยู่
update public.items i set
  name                = s.name,
  sku                 = coalesce(case when s.sku_taken_by is null then s.sku end, i.sku),
  category_id         = coalesce(c.id, i.category_id),
  unit_code           = u.code,
  cost_per_unit       = s.cost,
  reorder_point       = s.reorder_point,
  default_supplier_id = coalesce(sp.id, i.default_supplier_id),
  is_active           = true
  from _sheet s
  join public.units u on u.name_th = s.unit_th
  left join public.item_categories c on c.name = s.category
  left join public.suppliers sp on sp.name = s.supplier
 where i.legacy_id = s.legacy_id
   and (i.name, i.sku, i.category_id, i.unit_code, i.cost_per_unit, i.reorder_point, i.default_supplier_id, i.is_active)
       is distinct from
       (s.name, coalesce(case when s.sku_taken_by is null then s.sku end, i.sku), coalesce(c.id, i.category_id), u.code,
        s.cost::numeric(12, 4), s.reorder_point::numeric(12, 3), coalesce(sp.id, i.default_supplier_id), true);

-- 6) เพิ่มสินค้าใหม่ (ยอดเริ่ม 0 แล้วตั้งยอดในขั้นถัดไป)
insert into public.items
  (legacy_id, sku, name, category_id, unit_code, cost_per_unit, reorder_point, default_supplier_id, is_active, created_at)
select s.legacy_id, case when s.sku_taken_by is null then s.sku end, s.name, c.id, u.code, s.cost, s.reorder_point, sp.id, true,
       coalesce(s.created_at, now())
  from _sheet s
  join public.units u on u.name_th = s.unit_th
  left join public.item_categories c on c.name = s.category
  left join public.suppliers sp on sp.name = s.supplier
 where not exists (select 1 from public.items i where i.legacy_id = s.legacy_id);

-- 6.1) สินค้าที่มีแต่ในเว็บ → ปิดใช้งาน
with hidden as (
  update public.items i set is_active = false
   where i.is_active
     and not exists (select 1 from _sheet s where s.legacy_id = i.legacy_id)
  returning i.legacy_id, i.name, i.current_stock, i.cost_per_unit
)
insert into public._sync_log_20261113 (legacy_id, item, field, before, after)
select legacy_id, name, 'ปิดใช้งาน (ไม่มีในชีต)',
       'ยอด ' || trim_scale(current_stock) || ' · มูลค่า ' || round(greatest(current_stock, 0) * cost_per_unit, 2), 'ปิด'
  from hidden;

-- 7) ตั้งยอดสต็อกตามชีต (movement "count" = ส่วนต่าง, trigger ปรับ items.current_stock ให้)
insert into public.stock_movements (item_id, movement_type, quantity, note)
select i.id, 'count', s.stock - i.current_stock, 'ปรับตาม Google Sheets ระบบเดิม (StockSummary 13 พ.ย. 2026)'
  from _sheet s join public.items i on i.legacy_id = s.legacy_id
 where i.current_stock <> s.stock;

-- ตรวจ: ยอดทุกสินค้าต้องตรงกับชีต ไม่ตรง → ยกเลิกทั้งหมด
do $$
declare bad text; v_total numeric;
begin
  select string_agg(i.name || ' (เว็บ ' || i.current_stock || ' / ชีต ' || s.stock || ')', ', ') into bad
    from _sheet s join public.items i on i.legacy_id = s.legacy_id
   where i.current_stock <> s.stock;
  if bad is not null then raise exception 'ยอดไม่ตรงกับชีต: %', bad; end if;
  if exists (select 1 from _sheet s where not exists (select 1 from public.items i where i.legacy_id = s.legacy_id)) then
    raise exception 'ยังมีสินค้าในชีตที่ไม่ได้อยู่ในเว็บ';
  end if;
  select sum(greatest(stock_value, 0)) into v_total from public.v_inventory where is_active;
  if abs(coalesce(v_total, 0) - 33846.61) >= 0.01 then
    raise exception 'มูลค่าคลังในเว็บ % ไม่เท่ากับชีต 33846.61', v_total;
  end if;
end $$;

-- 8) ยอดรายวันของวันนี้: ลบแถวของสินค้าที่เพิ่งปิด แล้วบันทึกใหม่จากยอดปัจจุบัน
delete from public.stock_daily_snapshots d
 using public.items i
 where i.id = d.item_id and not i.is_active
   and d.snapshot_date = (now() at time zone 'Asia/Bangkok')::date;
select public.take_stock_snapshot();

commit;

-- ผลลัพธ์: สิ่งที่เปลี่ยนในรอบนี้
select item as สินค้า, field as เรื่อง, before as ก่อน, after as หลัง
  from public._sync_log_20261113
union all
select '(ไม่มีอะไรต่างจากชีต)', null, null, null
 where not exists (select 1 from public._sync_log_20261113)
union all
select '— มูลค่าคลังในเว็บตอนนี้', null, null, sum(greatest(stock_value, 0))::text || ' บาท (ชีต 33846.61)'
  from public.v_inventory where is_active;
