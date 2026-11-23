-- =====================================================================
-- ตั้งยอดสต็อกในเว็บให้ตรงกับ Google Sheets ระบบเดิม (StockSummary.current_stock) เป็นยอดของวันที่ 15 พ.ย. 2026
-- ดึงจากชีตเมื่อ 2026-11-15T13:09:06.022Z (ชีตไม่ถูกแก้ไข)
-- เปลี่ยนเฉพาะยอดสต็อก (ข้อมูลสินค้าอื่นตรงกับชีตอยู่แล้ว ดู docs/legacy-stock-excel.md)
--   - บันทึกเป็น movement "count" = ส่วนต่าง, occurred_at 15 พ.ย. 19:58 (หลังรายการสุดท้ายในชีต) — trigger ปรับ items.current_stock
--   - "แก้วร้อน" (001) = ยอด "แก้วร้อนน" (P_1793615352134481) ในชีต / ข้าม 002
--   - ตรวจมูลค่าคลังในเว็บ = 27476.99 บาท (ตามชีต) ไม่ตรง → ยกเลิกทั้งหมด
--   - บันทึกยอดรายวันของ 15 พ.ย. ใหม่
-- รันซ้ำได้ (รอบสองไม่เปลี่ยนอะไร) / ผลลัพธ์ = รายการที่ปรับ
-- =====================================================================
begin;

create temp table _sheet (legacy_id text primary key, name text, stock numeric not null) on commit drop;
insert into _sheet values
  ('001', 'แก้วร้อน', 471),
  ('P_1787219611354781', 'นมจืด Meiji Ray', 1),
  ('P_1787219795422556', 'นมข้นหวาน', 1),
  ('P_1787223536248266', 'นมข้นจืด 1L', 4),
  ('P_1787223899545441', 'น้ำส้ม', 1),
  ('P_1787229261134792', 'นมโอ๊ต 1L', 2),
  ('P_1787229399929609', 'ครีมแท้ 1L', 0),
  ('P_1787229652301916', 'โซดาเลม่อน tonic กระป๋อง', 3),
  ('P_1787372461676245', 'น้ำตาลคาราเมล', 4),
  ('P_1787384892023496', 'ชาอินโด 500 G', 1),
  ('P_1787384965371200', 'โซดา', 16),
  ('P_1787385040853482', 'โกโกสูตร2 1000g', 810),
  ('P_1787385263654941', 'โกโก้ Dutch', 850),
  ('P_1787386388755732', 'มัทฉะNishio', 143),
  ('P_1787387098356136', 'มัทฉะ Yame', 808),
  ('P_1787484442179381', 'ครัวซองต์', 0),
  ('P_1787484494705467', 'ชิโอะปัง', 27),
  ('P_1787485590406222', 'ขวดโคบรูว', 84),
  ('P_1787620020257415', 'Guatemala', 4),
  ('P_1787620049599142', 'Laos', 2),
  ('P_1787620130107514', 'Ethiopia Bench maji', 0),
  ('P_1787620165699631', 'Hondurus', 948),
  ('P_1787626818483263', 'Brazil', 300),
  ('P_1787626917965483', 'China', 0),
  ('P_1787627110815920', 'แก้วใส', 500),
  ('P_1787627140607431', 'แก้วดำ', 350),
  ('P_1787627317219396', 'หลอด 100×50 แพ็ค', 500),
  ('P_1787627687959959', 'ทิชชู่แห้ง', 8),
  ('P_1787627714628757', 'ทิชชู่เปียก', 3),
  ('P_1787627805501911', 'กระดาษใบเสร็จ', 4),
  ('P_1787627889882795', 'ถุงหิ้วคู่', 52),
  ('P_1787627917673672', 'ถุงหิ้วเดี่ยว', 75),
  ('P_1787627977187824', 'ถุงซิปล็อค 1 kg 222 ใบ', 4),
  ('P_1787628047785293', 'ถุงกระดาษ', 90),
  ('P_1787628085797113', 'ถุงขยะถังใหญ่', 25),
  ('P_1787628178254922', 'ถุงขยะถังเล็ก', 1),
  ('P_1787628225171587', 'ถุงใส่กากกาแฟ', 21),
  ('P_1787628316855782', 'น้ำยาล้างจาน', 1),
  ('P_1788269200706407', 'Ethiopia Sidamo', 900),
  ('P_1791477075743628', 'Orange cake', 9),
  ('P_1791477214590100', 'Coconut Cake', 2),
  ('P_1791477281746229', 'Chocolate cake.', 3),
  ('P_1791477538458164', 'Blueberry cheesecake', 19),
  ('P_1791477609621750', 'New york cheesecake', 6),
  ('P_1792324665297393', 'กระดาษกันหก', 103),
  ('P_1793699877128547', 'ไซรัปบลูฮาวาย 760 ML', 1),
  ('P_1793700067285104', 'ไซรัปสตอเบอรี่ 760 ML', 1),
  ('P_1793700794957336', 'ไซรัปลิ้นจี่', 1),
  ('P_1793700836203534', 'ไซรัปเลม่อน', 1),
  ('P_1793701229930930', 'ไซรัปยูสุ 2 KG', 1),
  ('P_1793701368731127', 'ไซรับโมจิโต', 1),
  ('P_1793701431828470', 'ไซรัปพินาโคลาดา', 1),
  ('P_1793701506503465', 'ไซรัปบลูคูราโซ่', 1),
  ('P_1793701556081315', 'ไซรัปชาดำ', 1),
  ('P_1794474036641877', 'BROOKIE', 17);

do $$
begin
  if exists (select 1 from _sheet s where not exists (select 1 from public.items i where i.legacy_id = s.legacy_id and i.is_active)) then
    raise exception 'มีสินค้าในชีตที่ไม่มีในเว็บ (หรือถูกปิด) — ใช้ sync_from_sheet แบบเต็มแทน';
  end if;
end $$;

create temp table _changed on commit drop as
select i.id, i.name, i.current_stock as before, s.stock as after
  from _sheet s join public.items i on i.legacy_id = s.legacy_id
 where i.current_stock <> s.stock;

insert into public.stock_movements (item_id, movement_type, quantity, note, occurred_at)
select id, 'count', after - before, 'ปรับตาม Google Sheets ระบบเดิม (StockSummary 15 พ.ย. 2026)', '2026-11-15 19:58:00+07'
  from _changed;

do $$
declare bad text; v_total numeric;
begin
  select string_agg(i.name || ' (เว็บ ' || i.current_stock || ' / ชีต ' || s.stock || ')', ', ') into bad
    from _sheet s join public.items i on i.legacy_id = s.legacy_id where i.current_stock <> s.stock;
  if bad is not null then raise exception 'ยอดไม่ตรงกับชีต: %', bad; end if;
  select sum(greatest(stock_value, 0)) into v_total from public.v_inventory where is_active;
  if abs(coalesce(v_total, 0) - 27476.99) >= 0.01 then
    raise exception 'มูลค่าคลังในเว็บ % ไม่เท่ากับชีต 27476.99', v_total;
  end if;
end $$;

select public.take_stock_snapshot('2026-11-15');

select name as สินค้า, trim_scale(before) as ก่อน, trim_scale(after) as หลัง from _changed order by name;
commit;
