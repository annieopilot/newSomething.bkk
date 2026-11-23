-- =====================================================================
-- รับของเข้าผ่าน LINE (/รับ) — 1 แถว = 1 ข้อความ /รับ ที่บันทึกแล้ว
-- เก็บ id ของ stock_movements ที่สร้าง เพื่อให้ /ยกเลิกรับ ลบรอบนั้นออกได้ภายใน 15 นาที
--
-- วิธีรัน: วางทั้งไฟล์ใน Supabase SQL Editor แล้ว Run (รันซ้ำได้) — ต้องรัน supabase/schema/01_line_bot.sql และ supabase/schema/02_inventory.sql มาก่อน
-- =====================================================================

begin;

create table if not exists public.line_receipts (
  id           bigint generated always as identity primary key,
  group_id     text        not null references public.line_targets (group_id) on delete cascade,
  user_id      text,                      -- LINE userId ของคนที่พิมพ์
  display_name text,                      -- ชื่อ LINE ตอนนั้น
  movement_ids bigint[]    not null,      -- stock_movements ที่สร้างจากข้อความนี้
  created_at   timestamptz not null default now(),
  undone_at    timestamptz                -- ยกเลิกแล้ว (movement ถูกลบ)
);

create index if not exists line_receipts_group_idx on public.line_receipts (group_id, created_at desc);

-- เปิด RLS โดยไม่สร้าง policy = เข้าถึงได้เฉพาะ service role (Edge Function) เหมือนตาราง LINE อื่น
alter table public.line_receipts enable row level security;

commit;
