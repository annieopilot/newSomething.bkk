-- =====================================================================
-- ส่วนที่ 1: ตารางและ view  (รันใน Supabase Dashboard > SQL Editor)
-- =====================================================================

-- กลุ่ม LINE ที่ลงทะเบียนรับแจ้งเตือน
create table if not exists public.line_targets (
  group_id   text primary key,
  created_at timestamptz not null default now()
);

-- จำสถานะที่แจ้งไปแล้ว เพื่อไม่แจ้งซ้ำ (ประหยัดโควตา push)
create table if not exists public.stock_alert_state (
  product_id  text primary key,
  status      text not null check (status in ('low','out')),
  notified_at timestamptz not null default now()
);

-- เปิด RLS โดยไม่สร้าง policy = เข้าถึงได้เฉพาะ service role (Edge Function)
alter table public.line_targets      enable row level security;
alter table public.stock_alert_state enable row level security;

-- view public.v_stock_status (ข้อมูลที่บอทอ่าน) อยู่ใน supabase/inventory.sql — อ่านจากตาราง items

-- =====================================================================
-- ส่วนที่ 2: ตั้งเวลาเรียก stock-alert  (รันหลัง deploy function แล้ว)
-- แก้ <project-ref> และ <CRON_SECRET> ให้ตรงกับของคุณ
-- pg_cron ใช้เวลา UTC: '0 1 * * *' = 08:00 เวลาไทย
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- สร้าง secret เฉพาะครั้งแรก (รันซ้ำได้ไม่ error; ถ้าจะเปลี่ยนค่าใช้ vault.update_secret)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'project_url') then
    perform vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
  end if;
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret('<CRON_SECRET>', 'cron_secret');
  end if;
end $$;

select cron.schedule(
  'stock-alert-daily',
  '0 1 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/stock-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ตรวจผล:
--   select * from cron.job_run_details order by start_time desc limit 5;
--   select id, status_code, content from net._http_response order by created desc limit 5;
-- ยกเลิกงาน:
--   select cron.unschedule('stock-alert-daily');