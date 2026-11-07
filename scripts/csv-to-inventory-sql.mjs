// แปลง Products.csv + StockSummary.csv (export จากระบบปัจจุบัน) เป็น SQL นำเข้า Inventory v2
// ใช้: node scripts/csv-to-inventory-sql.mjs [Products.csv] [StockSummary.csv] > supabase/import_inventory.sql
//
// รันซ้ำได้ทุกครั้งที่ export CSV ใหม่:
//   • สินค้า: upsert ตาม legacy_id (product_id เดิม)
//   • สต็อก: บันทึกเฉพาะ "ส่วนต่าง" ระหว่างยอดใน CSV กับยอดในระบบ เป็น movement (opening ครั้งแรก, count ครั้งต่อไป)
// คำเตือนการตรวจข้อมูลออกทาง stderr (ไม่ปนกับ SQL)
import { readFileSync } from "node:fs";

const [productsPath = "Products.csv", summaryPath = "StockSummary.csv"] = process.argv.slice(2);

function parseCsv(path) {
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  return data
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const warn = (msg) => console.error("⚠️ ", msg);
const str = (v) => (v === "" || v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const num = (v, field, id) => {
  if (v === "" || v == null) return "null";
  const n = Number(v);
  if (!Number.isFinite(n)) { warn(`${id}: ${field} ไม่ใช่ตัวเลข (${v})`); return "null"; }
  return String(n);
};
const ts = (v) => (v ? `'${v}+07'::timestamptz` : "null"); // เวลาใน CSV เป็นเวลาไทย

// รวมชื่อผู้ขายที่ต่างกันแค่ตัวพิมพ์/ช่องว่าง เช่น "BakingHome" กับ "Baking Home"
const supplierKey = (s) => s.toLowerCase().replace(/\s+/g, "");
const supplierName = new Map();
const canonicalSupplier = (s) => {
  if (!s) return "";
  const k = supplierKey(s);
  if (!supplierName.has(k)) supplierName.set(k, s);
  else if (supplierName.get(k) !== s) warn(`รวมผู้ขาย "${s}" เข้ากับ "${supplierName.get(k)}"`);
  return supplierName.get(k);
};

const products = parseCsv(productsPath);
const summary = new Map(parseCsv(summaryPath).map((r) => [r.product_id, r]));

const values = [];
const seenSku = new Map();
for (const p of products) {
  const id = p.product_id;
  if (!id || !p.product_name) { warn(`ข้ามแถว product_id=${id || "(ว่าง)"} เพราะไม่มีชื่อสินค้า`); continue; }

  const s = summary.get(id);
  if (!s) warn(`${id} ${p.product_name}: ไม่มีใน StockSummary — ไม่ปรับยอดสต็อก`);
  else {
    if (s.product_name !== p.product_name) warn(`${id}: ชื่อไม่ตรงกัน Products="${p.product_name}" / Summary="${s.product_name}" (ใช้ของ Products)`);
    const calc = Number(s.total_in) - Number(s.total_out) + Number(s.adjustment);
    if (Math.abs(calc - Number(s.current_stock)) > 1e-6) warn(`${id}: current_stock ${s.current_stock} ≠ in-out+adj ${calc}`);
    if (Number(s.current_stock) < 0) warn(`${id} ${p.product_name}: สต็อกติดลบ (${s.current_stock})`);
  }
  if (p.sku) {
    if (seenSku.has(p.sku)) warn(`sku ${p.sku} ซ้ำ: ${seenSku.get(p.sku)} และ ${id}`);
    seenSku.set(p.sku, id);
  }

  values.push(
    `  (${[
      str(id), str(p.sku), str(p.product_name), str(p.category), str(p.unit),
      num(p.cost, "cost", id), num(p.reorder_point, "reorder_point", id), str(canonicalSupplier(p.supplier)),
      p.status.toLowerCase() === "active" ? "true" : "false",
      s ? num(s.current_stock, "current_stock", id) : "null",
      ts(p.created_at),
    ].join(", ")})`,
  );
}

console.log(`-- สร้างอัตโนมัติจาก ${productsPath} + ${summaryPath} เมื่อ ${new Date().toISOString()}
-- ต้องรัน supabase/inventory.sql ก่อน (ครั้งแรกครั้งเดียว) แล้วรันไฟล์นี้ใน Supabase SQL Editor
-- รันซ้ำได้: สินค้าอัปเดตตาม legacy_id, สต็อกบันทึกเฉพาะส่วนต่าง

begin;

-- ตารางพักข้อมูลชั่วคราว (ใช้ตารางปกติแทน temp table เพราะ SQL Editor ของ Supabase มองไม่เห็น temp table) — ลบทิ้งท้ายไฟล์
drop table if exists public._inventory_import;
create table public._inventory_import (
  legacy_id     text primary key,
  sku           text,
  name          text not null,
  category      text,
  unit_th       text,
  cost          numeric,
  reorder_point numeric,
  supplier      text,
  is_active     boolean,
  stock         numeric,
  created_at    timestamptz
);

-- เปิด RLS เอง เพื่อไม่ให้ SQL Editor ถาม "enable RLS" (ถ้าเลือก enable มันจะต่อคำสั่งท้ายไฟล์ หลังตารางถูกลบแล้ว → error)
alter table public._inventory_import enable row level security;

insert into public._inventory_import values
${values.join(",\n")};

-- หน่วยที่ไม่รู้จัก → หยุด (เพิ่มในตาราง units ก่อน)
do $$
declare missing text;
begin
  select string_agg(distinct i.unit_th, ', ') into missing
    from public._inventory_import i left join public.units u on u.name_th = i.unit_th
   where u.code is null;
  if missing is not null then
    raise exception 'ไม่รู้จักหน่วย: % — เพิ่มในตาราง public.units ก่อน', missing;
  end if;
end $$;

insert into public.item_categories (name)
select distinct category from public._inventory_import where category is not null
on conflict (name) do nothing;

insert into public.suppliers (name)
select distinct supplier from public._inventory_import where supplier is not null
on conflict (name) do nothing;

insert into public.items
  (legacy_id, sku, name, category_id, unit_code, cost_per_unit, reorder_point,
   default_supplier_id, is_active, created_at)
select i.legacy_id, i.sku, i.name, c.id, u.code, coalesce(i.cost, 0), coalesce(i.reorder_point, 0),
       s.id, i.is_active, coalesce(i.created_at, now())
  from public._inventory_import i
  join public.units u                on u.name_th = i.unit_th
  left join public.item_categories c on c.name = i.category
  left join public.suppliers s       on s.name = i.supplier
on conflict (legacy_id) do update set
  sku                 = excluded.sku,
  name                = excluded.name,
  category_id         = excluded.category_id,
  unit_code           = excluded.unit_code,
  cost_per_unit       = excluded.cost_per_unit,
  reorder_point       = excluded.reorder_point,
  default_supplier_id = excluded.default_supplier_id,
  is_active           = excluded.is_active;

-- ปรับยอดให้ตรงกับ CSV: ครั้งแรกเป็น opening, ครั้งต่อไปเป็น count (บันทึกเฉพาะส่วนต่าง)
insert into public.stock_movements (item_id, movement_type, quantity, note)
select it.id,
       case when it.current_stock = 0 and i.stock > 0
                 and not exists (select 1 from public.stock_movements m where m.item_id = it.id)
            then 'opening' else 'count' end,
       i.stock - it.current_stock,
       'นำเข้าจาก ${summaryPath}'
  from public._inventory_import i
  join public.items it on it.legacy_id = i.legacy_id
 where i.stock is not null and i.stock <> it.current_stock;

drop table public._inventory_import;

-- บันทึกเป็นยอดของ "วันนี้" (เวลาไทย) ในประวัติสต็อก — วันก่อนหน้าไม่ถูกแก้
-- (การปรับยอดด้านบนลงเวลาเป็นตอนนี้ และ snapshot วันเก่าเก็บเป็นแถวแยกไว้แล้ว)
do $$
begin
  if to_regprocedure('public.take_stock_snapshot(date)') is not null then
    perform public.take_stock_snapshot();
  end if;
end $$;

commit;

-- ตรวจผล: ยอดรวมตอนนี้ (ควรเท่ากับยอดรวม stock_value ใน CSV) และยอดรายวันล่าสุด
select 'ยอดปัจจุบัน' as รายการ, sum(greatest(stock_value, 0)) as มูลค่ารวม, count(*) as จำนวนสินค้า
  from public.v_inventory where is_active
union all
select 'snapshot ' || snapshot_date, total_value, item_count
  from (select * from public.v_stock_daily_totals order by snapshot_date desc limit 3) t;`);
console.error(`✅ สร้าง SQL ${values.length} รายการ`);
