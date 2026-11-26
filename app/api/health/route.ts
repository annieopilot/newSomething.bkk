import { connection } from 'next/server';
import { supabase } from '@/lib/supabase-server';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * GET /api/health — ให้ UptimeRobot / cron-job.org เรียกทุก 5–10 นาที
 *   - ปลุก function บน Vercel ไว้ (ลด cold start)
 *   - เรียก public.health_check() ใน Supabase → นับเป็นกิจกรรม กันโปรเจกต์ free tier ถูก pause
 * ตอบ 200 ถ้าเว็บต่อฐานข้อมูลได้, 503 ถ้าไม่ได้ (ตัวเฝ้าเว็บจะแจ้งว่าล่ม) — ไม่ต้องล็อกอิน ไม่คืนข้อมูลร้าน
 */
export async function GET() {
  await connection(); // ให้รันทุกครั้งที่เรียก ไม่ถูก prerender/cache (cacheComponents เปิดอยู่)

  const started = Date.now();
  const headers = { 'Cache-Control': 'no-store' };

  if (!isSupabaseConfigured) {
    return Response.json({ ok: false, error: 'supabase not configured' }, { status: 503, headers });
  }

  const { data, error } = await supabase.rpc('health_check');
  const ms = Date.now() - started;

  if (error || data !== true) {
    console.error('Health check failed:', error?.message ?? data);
    return Response.json({ ok: false, db: 'down', ms }, { status: 503, headers });
  }
  return Response.json({ ok: true, db: 'up', ms, at: new Date().toISOString() }, { headers });
}
