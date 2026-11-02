// supabase/functions/reminder-tick/index.ts
// เรียกโดย pg_cron (เฉพาะตอนมีเตือนถึงเวลา): ส่งเตือนเข้ากลุ่ม รวมหลายเตือนของกลุ่มเดียวกันเป็นข้อความเดียว
import { createClient } from "npm:@supabase/supabase-js@2";
import { canPush, pushText } from "../_shared/line.ts";
import { nextDaily } from "../_shared/reminder.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

type Reminder = { id: number; group_id: string; message: string; due_at: string; repeat: "none" | "daily" };

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }

  const now = new Date();
  const { data, error } = await db
    .from("reminders")
    .select("id,group_id,message,due_at,repeat")
    .lte("due_at", now.toISOString())
    .order("due_at")
    .limit(200);
  if (error) return json({ error: error.message }, 500);

  // "จอง" แต่ละเตือนก่อนส่ง โดยเลื่อน due_at ไปข้างหน้าแบบมีเงื่อนไข
  // ถ้า cron สองรอบทำงานซ้อนกัน รอบที่จองไม่ทันจะได้ 0 แถว และไม่ส่งซ้ำ
  const claimed: (Reminder & { next: string | null })[] = [];
  for (const r of (data ?? []) as Reminder[]) {
    const next = r.repeat === "daily"
      ? nextDaily(new Date(r.due_at), now).toISOString()
      : "infinity"; // ครั้งเดียว: พักไว้ก่อน ลบทิ้งเมื่อส่งสำเร็จ
    const { data: ok } = await db
      .from("reminders")
      .update({ due_at: next })
      .eq("id", r.id)
      .eq("due_at", r.due_at)
      .select("id");
    if (ok?.length) claimed.push({ ...r, next: r.repeat === "daily" ? next : null });
  }

  const byGroup = Map.groupBy(claimed, (r) => r.group_id);
  let delivered = 0;
  const failed: unknown[] = [];

  for (const [gid, items] of byGroup) {
    const text = items.length === 1
      ? `⏰ เตือน: ${items[0].message}`
      : `⏰ เตือน (${items.length})\n${items.map((r) => `• ${r.message}`).join("\n")}`;

    const quota = await canPush(gid);
    const sent = quota.ok && (await pushText(gid, text));

    if (sent) {
      delivered += items.length;
      const once = items.filter((r) => r.repeat === "none").map((r) => r.id);
      if (once.length) await db.from("reminders").delete().in("id", once);
    } else {
      // ส่งไม่ได้ (โควตาหมด/LINE error) -> คืนเวลาเดิม ให้ลองใหม่รอบหน้า
      // ยกเว้นค้างเกิน 1 ชม. แล้ว ให้ข้ามไป (ครั้งเดียว = ลบ, ทุกวัน = รอรอบถัดไป) จะได้ไม่วนส่งทั้งวัน
      for (const r of items) {
        const stale = now.getTime() - new Date(r.due_at).getTime() > 3600_000;
        if (stale && r.repeat === "none") await db.from("reminders").delete().eq("id", r.id);
        else if (!stale) await db.from("reminders").update({ due_at: r.due_at }).eq("id", r.id);
      }
      failed.push({ group: gid, ids: items.map((r) => r.id), quota });
    }
  }

  return json({ due: data?.length ?? 0, claimed: claimed.length, delivered, failed });
});
