-- ==============================================================================
-- ⚠️ ข้อเสนอ (PROPOSED) — ยังไม่ได้รันกับฐานข้อมูลจริง
-- RLS policies สำหรับให้ผู้ใช้ที่ล็อกอินผ่าน Supabase Auth (role: authenticated)
-- แก้ไขตาราง supplies / stock / products ได้
--
-- ก่อนรัน:
--   1. ตรวจ policy ที่มีอยู่จริงด้วยคำสั่งในส่วนที่ 0 แล้วเทียบกับไฟล์นี้
--   2. ปิด "Allow new users to sign up" ใน Supabase Dashboard → Authentication → Sign In / Providers
--      ไม่อย่างนั้นใครก็สมัครแล้วได้ role authenticated และแก้ข้อมูลได้
--   3. รันทีละส่วนใน Supabase Dashboard → SQL Editor
-- ==============================================================================


-- ------------------------------------------------------------------------------
-- 0. ตรวจสอบ policy และสถานะ RLS ปัจจุบัน (อ่านอย่างเดียว)
-- ------------------------------------------------------------------------------
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('supplies', 'stock', 'products')
ORDER BY tablename, cmd;

SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relname IN ('supplies', 'stock', 'products');

-- หมายเหตุ: supabase/schema.sql เดิมมี policy "Allow public all access to stock" (FOR ALL USING (true))
-- ถ้ายังมีอยู่ แปลว่าใครก็เขียนตาราง stock ได้โดยไม่ต้องล็อกอิน ควรพิจารณาลบ:
-- DROP POLICY IF EXISTS "Allow public all access to stock" ON public.stock;


-- ------------------------------------------------------------------------------
-- 1. supplies — แอปใช้ SELECT / INSERT / UPDATE / DELETE
--    (UPDATE/DELETE ที่มีเงื่อนไข WHERE ต้องมี policy SELECT ด้วย จึงจะหาแถวเจอ)
-- ------------------------------------------------------------------------------
ALTER TABLE public.supplies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplies_select_authenticated" ON public.supplies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "supplies_insert_authenticated" ON public.supplies
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "supplies_update_authenticated" ON public.supplies
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "supplies_delete_authenticated" ON public.supplies
  FOR DELETE TO authenticated USING (true);

-- หน้าเว็บอ่านข้อมูลโดยไม่ต้องล็อกอิน (role anon) — ถ้าตอนนี้อ่านได้อยู่แล้วแปลว่ามี policy นี้แล้ว ไม่ต้องรันซ้ำ
-- CREATE POLICY "supplies_select_anon" ON public.supplies FOR SELECT TO anon USING (true);


-- ------------------------------------------------------------------------------
-- 2. stock — ตรวจผลจากส่วนที่ 0 ก่อน: ตามที่ตรวจพบ มี policy สำหรับ authenticated อยู่แล้ว
--    รันเฉพาะคำสั่ง (cmd) ที่ยังขาด
-- ------------------------------------------------------------------------------
-- CREATE POLICY "stock_select_authenticated" ON public.stock FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "stock_insert_authenticated" ON public.stock FOR INSERT TO authenticated WITH CHECK (true);
-- CREATE POLICY "stock_update_authenticated" ON public.stock FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY "stock_delete_authenticated" ON public.stock FOR DELETE TO authenticated USING (true);


-- ------------------------------------------------------------------------------
-- 3. products — โค้ดเว็บปัจจุบัน "ยังไม่ได้ใช้" ตารางนี้ (ใช้แค่ supplies และ stock)
--    เพิ่มไว้เผื่ออนาคต หรือถ้ามีระบบอื่น (เช่น POS) ที่เขียนตารางนี้ด้วยสิทธิ์ผู้ใช้
-- ------------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_authenticated" ON public.products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "products_insert_authenticated" ON public.products
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "products_update_authenticated" ON public.products
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "products_delete_authenticated" ON public.products
  FOR DELETE TO authenticated USING (true);


-- ------------------------------------------------------------------------------
-- 4. (ทางเลือกที่ปลอดภัยกว่า) จำกัดเฉพาะพนักงานที่อยู่ใน allowlist แทน authenticated ทั้งหมด
--    ต้องสร้างตารางใหม่ (เปลี่ยน schema) — ใช้แทน USING (true) / WITH CHECK (true) ด้านบน
-- ------------------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS public.staff_users (
--   user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
--   created_at timestamptz NOT NULL DEFAULT now()
-- );
-- ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;  -- ไม่มี policy = client อ่าน/เขียนไม่ได้
--
-- CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
--   AS $$ SELECT EXISTS (SELECT 1 FROM public.staff_users WHERE user_id = (SELECT auth.uid())) $$;
--
-- ตัวอย่าง: CREATE POLICY "supplies_update_staff" ON public.supplies
--   FOR UPDATE TO authenticated USING ((SELECT public.is_staff())) WITH CHECK ((SELECT public.is_staff()));
--
-- เพิ่มพนักงาน: INSERT INTO public.staff_users (user_id) SELECT id FROM auth.users WHERE email = '<อีเมลพนักงาน>';
