# เอกสารบันทึกโครงสร้างฐานข้อมูล Supabase และสิ่งที่ต้องเพิ่มในอนาคต (Schema Backlog)

เอกสารฉบับนี้จัดทำขึ้นเพื่อบันทึกสถานะของตารางจริงใน **Supabase Project (`fbffythkfzykzrgzpvfx`)** เทียบกับจุดประสงค์ของระบบบริหารสต็อกร้านกาแฟและฟังก์ชันชั่งตัดน้ำหนักภาชนะ (Tare Weight) เพื่อให้สามารถเพิ่มคอลัมน์/ตารางเพิ่มเติมได้ในภายหลัง โดยไม่ต้อง Mockup ข้อมูลปลอม

---

## 1. สถานะตารางที่มีอยู่ใน Supabase ปัจจุบัน

### 1.1 ตาราง `supplies` (พัสดุและบรรจุภัณฑ์)
* **จำนวนข้อมูลจริง**: 16 รายการ (เช่น ถุงซิปล็อค, ถุงหิ้วคู่, แก้วใส, แก้วดำ, หลอด, ทิชชู่, น้ำยาล้างจาน ฯลฯ)
* **คอลัมน์ที่มีอยู่แล้ว**:
  - `id` (int8, primary key)
  - `item_name` (text) - ชื่อพัสดุ
  - `category` (text) - เช่น Packaging, Supply
  - `unit` (text) - เช่น kg, ใบ, อัน, ห่อ, ม้วน, กิโล, ถุง, ขวด
  - `purchase_price` (numeric) - ราคาซื้อ
  - `package_quantity` (numeric) - ปริมาณต่อแพ็ค
  - `cost_per_unit` (numeric) - ต้นทุนต่อหน่วย
  - `stock_quantity` (numeric) - จำนวนสต็อกคงเหลือ
  - `created_at` (timestamptz)

### 1.2 ตาราง `stock` (สินค้าหน้าร้านและเมนู POS)
* **จำนวนข้อมูลจริง**: 53 รายการ (เช่น เค้กส้ม, นิวยอร์กชีสเค้ก, กาแฟ Americano, Shio pan, ครัวซองต์ ฯลฯ)
* **คอลัมน์ที่มีอยู่แล้ว**:
  - `id` (int8, primary key)
  - `item_name` (text) - ชื่อสินค้า/เมนู
  - `barcode` (text) - รหัสบาร์โค้ด
  - `category` (text) - เช่น Coffee, Cake, Bakery, NON-COFF, Matcha, Combo set
  - `sale_type` (text) - รูปแบบการขาย เช่น ราคาต่อหน่วย
  - `price` (numeric) - ราคาขายหน้าร้าน
  - `unit` (text) - เช่น Cup, หน่วย, Pcs, m/les
  - `avg_cost` (numeric) - ต้นทุนเฉลี่ย
  - `profit_margin` (text) - กำไร (%)
  - `stock_quantity` (numeric) - จำนวนสต็อกคงเหลือ
  - `created_at` (timestamptz)

### 1.3 ตาราง `products` (รายการเมนูและตัวเลือกเมล็ดกาแฟ)
* **จำนวนข้อมูลจริง**: 53 รายการ (มีคอลัมน์ `item_number`, `item_name`, `variant_name`, `price`, `category`)

---

## 2. สิ่งที่ยังไม่มีใน Supabase (บันทึกไว้สร้างเพิ่มเติมภายหลัง)

เพื่อให้ระบบตอบโจทย์จุดประสงค์เดิมได้อย่างสมบูรณ์แบบ แนะนำให้เพิ่มโครงสร้างเหล่านี้ใน Supabase เมื่อพร้อม:

### 2.1 เพิ่มคอลัมน์ในตาราง `supplies` และ `stock` (แนะนำทำเป็นอันดับแรก):
```sql
-- สำหรับรองรับระบบชั่งตัดน้ำหนักภาชนะ (Tare Weight) ตามจุดประสงค์เดิม
ALTER TABLE public.supplies ADD COLUMN IF NOT EXISTS tare_weight NUMERIC(10, 2) DEFAULT 0.0;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS tare_weight NUMERIC(10, 2) DEFAULT 0.0;

-- สำหรับกำหนดจุดแจ้งเตือนของใกล้หมด (Min Stock Reorder Point)
ALTER TABLE public.supplies ADD COLUMN IF NOT EXISTS min_stock NUMERIC(10, 2) DEFAULT 5.0;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS min_stock NUMERIC(10, 2) DEFAULT 10.0;

-- สำหรับบันทึกชื่อผู้จัดจำหน่าย (Supplier) และหมายเหตุ
ALTER TABLE public.supplies ADD COLUMN IF NOT EXISTS supplier TEXT;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS supplier TEXT;
ALTER TABLE public.supplies ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS notes TEXT;
```

### 2.2 ตาราง `ingredients` (วัตถุดิบชงกาแฟละเอียดระดับกรัม/มิลลิลิตร):
* หากต้องการแยกคลังเมล็ดกาแฟดิบ/คั่ว, นมสด, ไซรัป เป็นคลังวัตถุดิบเนื้อละเอียดโดยเฉพาะ สามารถรันคำสั่งสร้างตาราง `ingredients` ได้จากไฟล์ `supabase/archive/old_ingredients_schema.sql` ในภายหลัง
