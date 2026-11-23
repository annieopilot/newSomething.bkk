-- =====================================================================
-- ที่เก็บไฟล์ Excel ของคำสั่ง /excel ใน LINE
--
--   bucket "exports" (ส่วนตัว) — บอทสร้างไฟล์ไว้ในโฟลเดอร์ line/ แล้วส่งลิงก์ชั่วคราว (หมดอายุ 24 ชม.)
--   ไม่เปิดสาธารณะ และไม่มี policy ให้ผู้ใช้ทั่วไป: เฉพาะบอท (service role) อ่าน/เขียนได้ คนอื่นเข้าได้ผ่านลิงก์ชั่วคราวเท่านั้น
--   ไฟล์ที่เก่ากว่า 2 วันถูกลบอัตโนมัติตอนมีคนสั่ง /excel ครั้งถัดไป
--
-- วิธีรัน: วางทั้งไฟล์ใน Supabase SQL Editor แล้ว Run (รันซ้ำได้)
-- แล้ว deploy function ใหม่:  supabase functions deploy line-webhook --no-verify-jwt
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exports', 'exports', false, 10485760,  -- 10 MB
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
