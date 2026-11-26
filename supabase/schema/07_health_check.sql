-- =====================================================================
-- health_check() — ให้ /api/health (และ UptimeRobot ที่เรียกทุก 5 นาที) แตะฐานข้อมูลจริงแบบเบาที่สุด
--   ใช้ยืนยันว่าเว็บ → Supabase ยังต่อได้ และนับเป็นกิจกรรมกันโปรเจกต์ free tier ถูก pause
--   คืนแค่ true ไม่เปิดเผยข้อมูลร้าน จึงให้ anon เรียกได้
-- วิธีรัน: วางทั้งไฟล์ใน Supabase SQL Editor แล้ว Run (รันซ้ำได้)
-- =====================================================================
create or replace function public.health_check()
returns boolean
language sql stable security invoker set search_path = ''
as $$ select true $$;

revoke execute on function public.health_check() from public;
grant  execute on function public.health_check() to anon, authenticated;
