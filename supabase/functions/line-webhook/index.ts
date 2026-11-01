// supabase/functions/line-webhook/index.ts
// รับ event จาก LINE: ลงทะเบียนกลุ่ม และตอบคำสั่ง "สต็อก" (reply = ฟรี ไม่กินโควตา)
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Row, formatRows, replyText, verifySignature } from "../_shared/line.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const STOCK_WORDS = ["สต็อก", "สต๊อก", "stock", "/stock"];

async function isRegistered(groupId: string) {
  const { data } = await db.from("line_targets").select("group_id").eq("group_id", groupId).maybeSingle();
  return !!data;
}

Deno.serve(async (req) => {
  const body = await req.text();
  if (!(await verifySignature(body, req.headers.get("x-line-signature")))) {
    return new Response("bad signature", { status: 401 });
  }

  const { events = [] } = JSON.parse(body);

  for (const ev of events) {
    const gid: string | null = ev.source?.type === "group" ? ev.source.groupId : null;
    if (!gid || !ev.replyToken) continue; // รองรับเฉพาะในกลุ่ม

    if (ev.type === "join") {
      await replyText(ev.replyToken, "สวัสดีครับ 👋 พิมพ์ /register ตามด้วยรหัส เพื่อเปิดใช้งานแจ้งเตือนสต็อกในกลุ่มนี้");
      continue;
    }

    if (ev.type !== "message" || ev.message?.type !== "text") continue;
    const text: string = ev.message.text.trim();
    const lower = text.toLowerCase();

    // /register <รหัส>  -> ผูกกลุ่มนี้กับระบบ
    if (lower.startsWith("/register")) {
      const code = text.split(/\s+/)[1];
      if (code && code === Deno.env.get("REGISTER_CODE")) {
        await db.from("line_targets").upsert({ group_id: gid });
        await replyText(ev.replyToken, "✅ ลงทะเบียนกลุ่มนี้แล้ว จะแจ้งเตือนเมื่อมีสินค้าใกล้หมด\nพิมพ์ “สต็อก” เพื่อดูรายการตอนนี้");
      } else {
        await replyText(ev.replyToken, "❌ รหัสไม่ถูกต้อง");
      }
      continue;
    }

    // คำสั่งอื่น ใช้ได้เฉพาะกลุ่มที่ลงทะเบียนแล้ว
    if (!(await isRegistered(gid))) continue;

    if (STOCK_WORDS.includes(lower)) {
      const { data, error } = await db.from("v_stock_status").select("*").neq("status", "ok");
      if (error) {
        console.error(error);
        await replyText(ev.replyToken, "ดึงข้อมูลสต็อกไม่สำเร็จ ลองใหม่อีกครั้ง");
      } else if (!data?.length) {
        await replyText(ev.replyToken, "✅ ตอนนี้ไม่มีสินค้าใกล้หมด");
      } else {
        await replyText(ev.replyToken, formatRows(data as Row[]));
      }
    } else if (lower === "/help") {
      await replyText(ev.replyToken, "คำสั่ง:\n• สต็อก — ดูสินค้าใกล้หมด/หมด\n• /help — ดูคำสั่ง");
    }
  }

  return new Response("ok");
});