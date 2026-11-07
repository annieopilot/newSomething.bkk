# คู่มืออ่านไฟล์สต็อกระบบเดิม (สำหรับ AI / คนที่มาทำต่อ)

ไฟล์ `ข้อมูลต๊อกอันเก่า.xlsx` = export ทั้งหมดจากระบบเดิม "Web App ระบบ Stock Inventory + Email Reminder"
(Google Sheets + Apps Script) ใช้งาน 26 ส.ค. – 6 พ.ย. 2026 ก่อนย้ายมาเว็บนี้ (Next.js + Supabase)
ไฟล์ CSV ชื่อ `*Products.csv` / `*StockSummary.csv` ในโฟลเดอร์หลัก คือชีตเดียวกันที่ export แยก (รุ่นต่างวันกัน)

**ข้อมูลในไฟล์นี้ถูกนำเข้าเว็บแล้วเมื่อ 7 พ.ย. 2026** (`supabase/import_from_old_xlsx.sql`) — ห้ามนำเข้าซ้ำ
ถ้าไม่ได้ตั้งใจจะล้างประวัติที่บันทึกในเว็บหลังจากนั้น (สคริปต์นั้นลบประวัติของสินค้าจากระบบเดิมแล้วลงใหม่)

## ชีตในไฟล์

| ชีต | เนื้อหา |
|---|---|
| `คู่มือ` | คู่มือของระบบเดิม (ข้อความ ไม่ใช่ข้อมูล) |
| `Products` | สินค้า 1 แถว/สินค้า: `product_id, sku, product_name, category, unit, cost, reorder_point, supplier, status, created_at, updated_at` |
| `Movements` | ประวัติเข้า-ออก: `movement_id, movement_date, product_id, sku, movement_type, quantity, note, recorded_by, stock_after, created_at` |
| `StockSummary` | ยอดสรุปที่ระบบเดิมคำนวณ: `product_id, sku, product_name, category, unit, cost, total_in, total_out, adjustment, current_stock, reorder_point, stock_value, stock_status, suggested_order_qty, last_movement_at` |
| `Settings` | ค่าตั้งของระบบเดิม (อีเมลแจ้งเตือน, รายการหมวด/หน่วย/ผู้ขาย/ผู้บันทึก) — เว็บใหม่ไม่ใช้ (แจ้งเตือนทาง LINE) |

`ws.rowCount` ของทุกชีตรายงาน ~20000 แต่ส่วนใหญ่เป็นแถวว่าง — กรองแถวที่ไม่มีค่าออก
(ข้อมูลจริง: Products 56, Movements 760, StockSummary 56)

## ความหมายที่ต้องรู้ (สำคัญ)

1. **`ADJUST` = ตั้งยอดตามที่นับได้ (ค่าสัมบูรณ์) ไม่ใช่บวก/ลบ**
   `quantity` ของ ADJUST คือยอดหลังนับ (`stock_after` = `quantity`) ส่วน `IN` = รับเข้า (+), `OUT` = ใช้ออก (−)
   ทุก quantity เป็นบวก ถ้าเอา ADJUST ไปบวกตรงๆ ยอดจะผิดเกือบทุกรายการ
   ส่วน `StockSummary.adjustment` = ผลสุทธิของการนับ (`current_stock − total_in + total_out`) ไม่ใช่ผลรวม quantity ของ ADJUST

2. **เวลาเป็นเวลาไทยแต่ไม่มี timezone** — ไลบรารีอ่าน Excel (เช่น exceljs) จะคืนเป็น Date แบบ UTC (`...Z`)
   ให้ตัด `Z` แล้วถือเป็น `+07` (ร้านบันทึกช่วง 16:00–20:00 เป็นส่วนใหญ่ ถ้าเห็นช่วงตี 2–ตี 3 แปลว่าแปลงผิด)
   `movement_date` = วันที่ของรายการ (เวลา 00:00), `created_at` = เวลาที่กดบันทึกจริง
   มี 4 รายการที่บันทึกย้อนหลัง (`movement_date` 10 ก.ย. แต่ `created_at` 11 ก.ย. เช้า) → ใช้ 23:59 ของ `movement_date`

3. **`product_id` เลข 0 นำหน้าหาย** — สินค้า `001` (แก้วร้อน, sku 270) ถูกบันทึกใน Movements เป็น `1`
   (Sheets แปลง "001" เป็นตัวเลข) ระบบเดิมจึงไม่นับ 7 รายการนี้ ยอดแก้วร้อนใน StockSummary = 0
   ตอนนำเข้า **ข้าม 7 รายการนี้** เพื่อให้ยอดตรงกับ StockSummary
   ผลข้างเคียง: มีคนสร้างสินค้าซ้ำ `P_1793615352134481` "แก้วร้อนน" (sku 27) เมื่อ 2 พ.ย. แล้วรับเข้า 500 ที่ตัวนั้น
   → ในเว็บรวมเข้า "แก้วร้อน" และลบตัวซ้ำแล้ว (`supabase/merge_hot_cup_20261107.sql`)
   ดังนั้น **ในเว็บจะไม่มี "แก้วร้อนน"** ทั้งที่ยังอยู่ในไฟล์ — ไม่ใช่ข้อมูลหาย
   ระวัง `product_id` ชนิดตัวเลข/ข้อความปนกัน: เทียบด้วย `String(id)` เสมอ

4. **ความสกปรกอื่น ๆ**
   - `002` = แถวว่าง ไม่มีชื่อ → ข้าม
   - ผู้ขาย `"Baking Home"` กับ `"BakingHome"` = รายเดียวกัน (รวมโดยตัดช่องว่าง/ตัวพิมพ์)
   - `sku` บางแถวเป็นตัวเลข บางแถวเป็นข้อความ → แปลงเป็นข้อความ
   - ADJUST ที่นับได้เท่ายอดเดิม (ส่วนต่าง 0) มี 29 รายการ — เว็บไม่บันทึก movement ที่ quantity = 0 (มี check constraint)

## วิธีตรวจว่าอ่านถูก

เรียง Movements ตาม `created_at` แล้วไล่ยอดทีละสินค้า (IN +q, OUT −q, ADJUST = q) โดยข้าม `product_id` ที่ไม่มีใน Products
- ยอดสุดท้ายต้องเท่ากับ `StockSummary.current_stock` **ทุกสินค้า**
- `stock_after` ต้องตรงกับยอดที่ไล่ได้ทุกแถว (ยกเว้น 3 แถวของ product_id `1`)
- มูลค่ารวม `Σ current_stock × cost` = **28,319.25 บาท** (ณ สิ้นวัน 6 พ.ย. 2026)

## จับคู่กับ schema ของเว็บ (`supabase/inventory.sql`)

| ระบบเดิม | เว็บ |
|---|---|
| `Products.product_id` | `items.legacy_id` (ใช้จับคู่/upsert) |
| `sku, product_name, cost, reorder_point` | `items.sku, name, cost_per_unit, reorder_point` |
| `category` / `supplier` | `item_categories.name` / `suppliers.name` |
| `unit` (ไทย เช่น กรัม, ใบ, ขวด) | `units.name_th` → `items.unit_code` |
| `status = Active` | `items.is_active` |
| `IN q` | `stock_movements` `purchase`, `+q` |
| `OUT q` | `usage`, `−q` |
| `ADJUST q` | `count`, `q − ยอดก่อนหน้า` (ส่วนต่าง) |
| `recorded_by`, `movement_id` | เก็บใน `stock_movements.note` รูปแบบ `ระบบเดิม · <ผู้บันทึก> · <M_...>` |

`items.current_stock` ถูกปรับอัตโนมัติด้วย trigger เมื่อเพิ่ม/แก้/ลบ `stock_movements` — อย่าแก้ยอดตรงๆ
ระหว่างนำเข้า (ถ้าจำเป็นต้องตั้งยอด ให้เปิด `set_config('inventory.syncing','on',true)` ก่อน ไม่งั้นจะเกิด movement `count` เพิ่ม)
ยอดรายวัน (`stock_daily_snapshots`) ที่สร้างจากประวัติเก่ามี `is_backfill = true` (มูลค่าคิดจากราคาปัจจุบัน)

## วิธีอ่านไฟล์

เครื่องนี้ (Windows) ไม่มี Python และโปรเจกต์ไม่มีไลบรารี Excel — ติดตั้ง `exceljs` ในโฟลเดอร์ชั่วคราว (ไม่ใช่ในโปรเจกต์):

```js
// npm i exceljs@4.4.0  (ในโฟลเดอร์ชั่วคราว)
const ExcelJS = require("exceljs");
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("ข้อมูลต๊อกอันเก่า.xlsx");
const val = (v) => (v && typeof v === "object" && "result" in v ? v.result : v); // เซลล์สูตร
function rows(name) {
  const ws = wb.getWorksheet(name);
  const header = ws.getRow(1).values;            // index เริ่มที่ 1 (ช่อง 0 ว่าง)
  const out = [];
  ws.eachRow((r, i) => {
    if (i === 1) return;
    const o = {};
    header.forEach((k, j) => { if (k) o[k] = val(r.getCell(j).value); });
    if (Object.values(o).some((x) => x != null && x !== "")) out.push(o);
  });
  return out;
}
```

## ไฟล์ที่เกี่ยวข้อง

- `supabase/import_from_old_xlsx.sql` — SQL ที่นำเข้าไฟล์นี้ทั้งหมด (สำรองข้อมูลเดิมไว้ใน `_backup_*_20261107`)
- `supabase/verify_old_xlsx.sql` — ตรวจเทียบเว็บกับไฟล์ (อ่านอย่างเดียว) — หลังรวมแก้วร้อนแล้ว จะแจ้งว่า
  "แก้วร้อน" ยอดไม่ตรง และ "แก้วร้อนน" ไม่มีในเว็บ ซึ่งเป็นเรื่องปกติ
- `supabase/merge_hot_cup_20261107.sql` — รวมแก้วร้อนนเข้าแก้วร้อน
- `scripts/csv-to-inventory-sql.mjs` — ตัวนำเข้าจาก CSV รุ่นแรก (เฉพาะสินค้า + ยอดคงเหลือ ไม่มีประวัติ)
