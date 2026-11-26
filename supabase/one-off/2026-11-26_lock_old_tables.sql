-- =====================================================================
-- ปิดตารางระบบรุ่นแรก supplies / stock / products (26 พ.ย. 2026)
--   ทั้งเว็บและ LINE bot ไม่ใช้แล้ว แต่ยังมี policy "Allow public read" → ใครก็อ่านราคาทุนได้โดยไม่ล็อกอิน
--   และ policy ให้ authenticated แก้/ลบได้
--   สำรองข้อมูลไว้ที่ data/legacy/old_tables_supplies_stock_products_20261126.json (products 53, stock 53, supplies 16)
--   ไม่ลบตาราง (ย้อนกลับได้) — แค่ลบ policy ทั้งหมดและถอนสิทธิ์ anon/authenticated → RLS ปิดกั้นทุกอย่าง
-- =====================================================================
begin;

do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
            where schemaname = 'public' and tablename in ('supplies', 'stock', 'products') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.supplies enable row level security;
alter table public.stock    enable row level security;
alter table public.products enable row level security;
revoke all on public.supplies, public.stock, public.products from anon, authenticated;

comment on table public.supplies is 'ระบบรุ่นแรก — เลิกใช้ ปิดสิทธิ์ 26 พ.ย. 2026 (สำรองใน data/legacy)';
comment on table public.stock    is 'ระบบรุ่นแรก — เลิกใช้ ปิดสิทธิ์ 26 พ.ย. 2026 (สำรองใน data/legacy)';
comment on table public.products is 'ระบบรุ่นแรก — เลิกใช้ ปิดสิทธิ์ 26 พ.ย. 2026 (สำรองใน data/legacy)';

commit;
