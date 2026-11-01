// supabase/functions/stock-alert/index.ts
// เรียกโดย pg_cron: แจ้งเฉพาะสินค้าที่ "เพิ่งเปลี่ยนเป็นใกล้หมด/หมด" รวมเป็นข้อความเดียว
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Row, canPush, formatRows, pushText } from "../_shared/line.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  // ฟังก์ชันนี้ deploy แบบ --no-verify-jwt จึงป้องกันด้วยรหัสลับของเราเอง
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }

  const { data: rows, error } = await db.from("v_stock_status").select("*");
  if (error) return json({ error: error.message }, 500);
  const { data: states, error: stateErr } = await db.from("stock_alert_state").select("product_id,status");
  // อ่านสถานะเดิมไม่ได้ = ห้ามส่ง ไม่งั้นจะ push ซ้ำทุกรายการและเปลืองโควตา
  if (stateErr) return json({ error: stateErr.message }, 500);

  const last = new Map((states ?? []).map((s) => [s.product_id, s.status]));
  const stock = rows as Row[];

  // สถานะเปลี่ยนเป็น low/out และยังไม่เคยแจ้งสถานะนี้
  const fresh = stock.filter((r) => r.status !== "ok" && last.get(r.product_id) !== r.status);
  // กลับมา ok แล้ว -> ล้างสถานะ เพื่อให้แจ้งใหม่ได้ถ้าลดลงอีกครั้ง
  const recovered = stock.filter((r) => r.status === "ok" && last.has(r.product_id)).map((r) => r.product_id);
  if (recovered.length) await db.from("stock_alert_state").delete().in("product_id", recovered);

  if (!fresh.length) return json({ sent: false, reason: "nothing new" });

  const { data: targets } = await db.from("line_targets").select("group_id");
  const date = new Date().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" });
  const text = `⚠️ แจ้งเตือนสต็อก ${date}\n\n${formatRows(fresh)}\n\nพิมพ์ “สต็อก” เพื่อดูรายการทั้งหมด`;

  let delivered = 0;
  const skipped: unknown[] = [];
  for (const t of targets ?? []) {
    const g = await canPush(t.group_id);
    if (!g.ok) {
      skipped.push({ group: t.group_id, ...g });
      continue;
    }
    if (await pushText(t.group_id, text)) delivered++;
  }

  // บันทึกว่าแจ้งแล้ว เฉพาะเมื่อส่งสำเร็จอย่างน้อยหนึ่งกลุ่ม (ถ้าล้มเหลวจะลองใหม่รอบหน้า)
  if (delivered > 0) {
    await db.from("stock_alert_state").upsert(
      fresh.map((r) => ({ product_id: r.product_id, status: r.status, notified_at: new Date().toISOString() })),
    );
  }
  return json({ sent: delivered > 0, delivered, skipped, newItems: fresh.length });
});