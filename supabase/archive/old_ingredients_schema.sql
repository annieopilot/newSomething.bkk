-- ==============================================================================
-- ☕ COFFEE & CAFE STOCK MANAGEMENT SYSTEM (SUPABASE SCHEMA & SEED DATA)
-- คัดลอกสคริปต์นี้ไปวางใน Supabase Dashboard -> SQL Editor แล้วกด "Run" ได้ทันที
-- ==============================================================================

-- 1. สร้างตาราง ingredients (ตารางหลักสำหรับสต็อกวัตถุดิบและระบบ Tare Weight)
CREATE TABLE IF NOT EXISTS public.ingredients (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'g',
    "tareWeight" NUMERIC(10, 2) DEFAULT 0.0,
    "currentStock" NUMERIC(10, 2) DEFAULT 0.0,
    "minStockLevel" NUMERIC(10, 2) DEFAULT 0.0,
    category TEXT DEFAULT 'ทั่วไป',
    "costPerUnit" NUMERIC(10, 2) DEFAULT 0.0,
    barcode TEXT,
    supplier TEXT,
    notes TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    "updatedAt" TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- เพิ่มคอลัมน์ barcode ถ้ายังไม่มี
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingredients' AND column_name='barcode') THEN
        ALTER TABLE public.ingredients ADD COLUMN barcode TEXT;
    END IF;
END $$;

-- 2. สร้าง Indexes สำหรับค้นหาและจัดเรียงอย่างรวดเร็ว
CREATE INDEX IF NOT EXISTS idx_ingredients_category ON public.ingredients(category);
CREATE INDEX IF NOT EXISTS idx_ingredients_name ON public.ingredients(name);
CREATE INDEX IF NOT EXISTS idx_ingredients_barcode ON public.ingredients(barcode);

-- 3. อัปเดตตาราง stock (หากมีอยู่แล้ว ให้มีโครงสร้างที่สอดคล้อง)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock' AND table_schema = 'public') THEN
        -- เพิ่มคอลัมน์ที่จำเป็นหากยังไม่มี
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock' AND column_name='tare_weight') THEN
            ALTER TABLE public.stock ADD COLUMN tare_weight NUMERIC(10, 2) DEFAULT 0.0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock' AND column_name='min_stock') THEN
            ALTER TABLE public.stock ADD COLUMN min_stock NUMERIC(10, 2) DEFAULT 0.0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock' AND column_name='notes') THEN
            ALTER TABLE public.stock ADD COLUMN notes TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock' AND column_name='supplier') THEN
            ALTER TABLE public.stock ADD COLUMN supplier TEXT;
        END IF;
    END IF;
END $$;

-- 4. เปิดใช้งาน Row Level Security (RLS) และ Policies ให้ Anon Key อ่าน-เขียนได้
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to ingredients" ON public.ingredients;
CREATE POLICY "Allow public read access to ingredients" 
    ON public.ingredients FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Allow public insert to ingredients" ON public.ingredients;
CREATE POLICY "Allow public insert to ingredients" 
    ON public.ingredients FOR INSERT 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update to ingredients" ON public.ingredients;
CREATE POLICY "Allow public update to ingredients" 
    ON public.ingredients FOR UPDATE 
    USING (true);

DROP POLICY IF EXISTS "Allow public delete to ingredients" ON public.ingredients;
CREATE POLICY "Allow public delete to ingredients" 
    ON public.ingredients FOR DELETE 
    USING (true);

-- อนุญาต RLS สำหรับตาราง stock ถ้ามี
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock' AND table_schema = 'public') THEN
        ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Allow public all access to stock" ON public.stock;
        CREATE POLICY "Allow public all access to stock" ON public.stock FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 5. Seed ข้อมูลวัตถุดิบร้านกาแฟเริ่มต้น 18 รายการ
TRUNCATE TABLE public.ingredients;

INSERT INTO public.ingredients (name, unit, "tareWeight", "currentStock", "minStockLevel", category, "costPerUnit", barcode, supplier, notes)
VALUES
  -- หมวด: เมล็ดกาแฟ (Coffee Beans)
  ('เมล็ดกาแฟปางขอน (Pangkhon Washed)', 'g', 14.5, 1250.0, 500.0, 'เมล็ดกาแฟ', 0.65, '885000100001', 'ดอยปางขอน เชียงราย', 'Medium Light Roast สำหรับ Filter และ Americano รสโทนนัทตี้ ช็อกโกแลต ดอกไม้สีขาว'),
  ('เมล็ดกาแฟ House Blend (Arabica 70% / Robusta 30%)', 'g', 22.0, 350.0, 1000.0, 'เมล็ดกาแฟ', 0.42, '885000100002', 'Local Roaster BKK', 'Medium Dark Roast สำหรับเมนูนมเย็น Signature Espresso เย็นและลาเต้'),
  ('เมล็ดกาแฟเอธิโอเปีย ยีกาเชฟ (Ethiopia Yirgacheffe Natural)', 'g', 14.5, 0.0, 250.0, 'เมล็ดกาแฟ', 1.20, '885000100003', 'Specialty Importer Co.', 'Light Roast สำหรับ Drip / Cold Brew โน้ตเบอร์รี่ ฟลอรัล สดชื่น'),
  ('เมล็ดกาแฟบราซิล เซอร์ราโด (Brazil Cerrado)', 'g', 18.0, 2200.0, 800.0, 'เมล็ดกาแฟ', 0.58, '885000100004', 'Specialty Importer Co.', 'Medium Roast โน้ตช็อกโกแลต ถั่ว บอดี้แน่น'),

  -- หมวด: นมและทางเลือก (Milk & Plant-based)
  ('นมสด Meiji Pasteurized (4,300 ml)', 'ml', 140.0, 8600.0, 4300.0, 'นมและทางเลือก', 0.052, '885000200001', 'CP-Meiji', 'นมวัวสดพาสเจอร์ไรส์รสจืด ตีโฟมนมเนียนเงา'),
  ('นมข้าวโอ๊ต Oatly Barista Edition (1,000 ml)', 'ml', 42.0, 950.0, 2000.0, 'นมและทางเลือก', 0.125, '885000200002', 'Oatly Thailand', 'นมพืชยอดนิยมสำหรับลาเต้อาร์ต เหมาะกับสาย Vegan'),
  ('นมข้นหวาน มะลิ Professional (2,000 g)', 'g', 35.0, 3400.0, 1500.0, 'นมและทางเลือก', 0.065, '885000200003', 'Mali Group', 'สูตรข้นหวานกลมกล่อม สำหรับเมนูไทยสไตล์'),
  ('นมข้นจืด คาร์เนชัน เอ็กซ์ตร้า (1,000 ml)', 'ml', 38.0, 2800.0, 1000.0, 'นมและทางเลือก', 0.055, '885000200004', 'Nestlé Foodservice', 'สำหรับชงชาไทย กาแฟโบราณ และเพิ่มความมัน'),

  -- หมวด: ชาและผงเครื่องดื่ม (Tea & Powders)
  ('ผงมัทฉะอุจิพรีเมียม (Ceremonial Uji Matcha)', 'g', 65.0, 85.0, 150.0, 'ชาและผงเครื่องดื่ม', 3.50, '885000300001', 'Kyoto Imports', 'ผงชาเขียวเกรดพิธีชงชา สีเขียวมรกต อูมามิเด่นชัด'),
  ('ผงโกโก้ดัตช์ 100% (Dutch Cocoa Powder)', 'g', 125.0, 1450.0, 500.0, 'ชาและผงเครื่องดื่ม', 0.45, '885000300002', 'Bakery Supply Hub', 'โกโก้แท้ไขมัน 22-24% เข้มข้น หอมมัน'),
  ('ชาไทยตรามือ ชาแดงปรุงสำเร็จ', 'g', 18.0, 1800.0, 500.0, 'ชาและผงเครื่องดื่ม', 0.16, '885000300003', 'ChaTraMue Official', 'ใบชาแดงบดละเอียด กลิ่นหอมชาไทยอันเป็นเอกลักษณ์'),

  -- หมวด: ไซรัปและซอส (Syrups & Sauces)
  ('ไซรัปวานิลลา Monin (700 ml)', 'ml', 460.0, 480.0, 300.0, 'ไซรัปและซอส', 0.48, '885000400001', 'Monin Thailand', 'หัวเชื้อวานิลลาธรรมชาติจากมาดากัสการ์ (ขวดแก้ว Tare: 460g)'),
  ('ไซรัปคาราเมล Monin (700 ml)', 'ml', 460.0, 150.0, 350.0, 'ไซรัปและซอส', 0.48, '885000400002', 'Monin Thailand', 'รสคาราเมลเข้มข้น หวานหอมกลมกล่อม'),
  ('ซอสช็อกโกแลตเข้มข้น Davinci (2,000 ml)', 'ml', 110.0, 1600.0, 500.0, 'ไซรัปและซอส', 0.35, '885000400003', 'Kerry Foodservice', 'ดาร์กช็อกโกแลตแท้ สำหรับมอคค่าและราดแต่งแก้ว'),

  -- หมวด: บรรจุภัณฑ์ (Packaging)
  ('แก้วกาแฟร้อน Double Wall 8oz', 'pcs', 0.0, 350.0, 200.0, 'บรรจุภัณฑ์', 2.20, '885000500001', 'EcoCup Packaging', 'แก้วกระดาษคราฟต์สองชั้น ไม่ร้อนมือ ไม่ต้องใช้ปลอก'),
  ('แก้วพลาสติกเย็น PET 16oz (ปาก 98mm)', 'pcs', 0.0, 80.0, 300.0, 'บรรจุภัณฑ์', 1.85, '885000500002', 'EcoCup Packaging', 'พลาสติกใสระดับพรีเมียม รีไซเคิลได้ 100%'),
  ('ฝายกดื่ม Sip Lid 98mm (ไม่ใช้หลอด)', 'pcs', 0.0, 450.0, 300.0, 'บรรจุภัณฑ์', 0.85, '885000500003', 'EcoCup Packaging', 'ฝาแบบยกดื่ม ล็อคแน่น ไม่หกเลอะ'),
  ('หลอดกระดาษไบโอห่อซองเดี่ยว 8mm', 'pcs', 0.0, 600.0, 200.0, 'บรรจุภัณฑ์', 0.40, '885000500004', 'BioStraw Co.', 'หลอดรักษ์โลก แช่เครื่องดื่มได้นานไม่เปื่อยง่าย');

