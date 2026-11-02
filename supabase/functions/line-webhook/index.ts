// supabase/functions/line-webhook/index.ts
// รับ event จาก LINE: ลงทะเบียนกลุ่ม ตอบคำสั่ง และตั้งเตือน (reply = ฟรี ไม่กินโควตา)
// ทุกคำสั่งต้องขึ้นต้นด้วย "/" ข้อความอื่นบอทไม่สนใจ
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Row, formatRows, replyText, verifySignature } from "../_shared/line.ts";
import { REMINDER_EXAMPLES, REMINDER_HELP, formatThai, parseReminder } from "../_shared/reminder.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const STOCK_CMDS = ["สต็อก", "สต๊อก", "stock"];
const HELP_CMDS = ["help", "ช่วย", "คำสั่ง"];
const MAX_REMINDERS_PER_GROUP = 50;

const HELP_TEXT = [
  "📖 คำสั่งทั้งหมด",
  "ทุกคำสั่งต้องขึ้นต้นด้วย / ข้อความอื่นบอทจะไม่ตอบ",
  "",
  "📦 สต็อก",
  "• /สต็อก — ดูสินค้าใกล้หมดและหมดแล้ว",
  "",
  REMINDER_HELP,
  "",
  "❓ /คำสั่ง — ดูหน้านี้อีกครั้ง",
].join("\n");

async function isRegistered(groupId: string) {
  const { data } = await db.from("line_targets").select("group_id").eq("group_id", groupId).maybeSingle();
  return !!data;
}

// ชื่อคำสั่งที่รู้จัก เรียงยาวก่อน เพื่อให้ "เตือนทุกวัน" ไม่ถูกจับเป็น "เตือน"
const KNOWN_CMDS = ["register", ...STOCK_CMDS, ...HELP_CMDS, "เตือนทุกวัน", "เตือน", "รายการเตือน", "ลบเตือน"]
  .sort((a, b) => b.length - a.length);

// "/เตือน 15:30 xxx" หรือ "/เตือน15:30 xxx" -> { cmd: "เตือน", args: "15:30 xxx" }
// ยอมให้เว้นวรรคหลัง / ได้ และไม่ต้องเว้นวรรคหลังชื่อคำสั่ง (คนไทยมักพิมพ์ติดกัน)
function parseCommand(text: string) {
  const m = text.trim().match(/^\/\s*([\s\S]+)$/);
  if (!m) return null;
  const body = m[1];
  const lower = body.toLowerCase();
  const known = KNOWN_CMDS.find((c) => lower.startsWith(c));
  if (known) return { cmd: known, args: body.slice(known.length).trim() };
  const [first] = body.split(/\s/, 1);
  return { cmd: first.toLowerCase(), args: body.slice(first.length).trim() };
}

async function addReminder(gid: string, userId: string | null, args: string, daily: boolean) {
  const parsed = parseReminder(args, daily);
  if (typeof parsed === "string") {
    return `❌ ${parsed}\n\nตัวอย่าง:\n${REMINDER_EXAMPLES}\n\nดูวิธีใช้ทั้งหมด: /คำสั่ง`;
  }

  const { count } = await db.from("reminders").select("id", { count: "exact", head: true }).eq("group_id", gid);
  if ((count ?? 0) >= MAX_REMINDERS_PER_GROUP) {
    return `❌ กลุ่มนี้มีเตือนครบ ${MAX_REMINDERS_PER_GROUP} รายการแล้ว ลบอันเก่าก่อนด้วย /ลบเตือน`;
  }

  const { data, error } = await db
    .from("reminders")
    .insert({
      group_id: gid,
      created_by: userId,
      message: parsed.text,
      due_at: parsed.dueAt.toISOString(),
      repeat: parsed.repeat,
    })
    .select("id")
    .single();
  if (error) {
    console.error(error);
    return "บันทึกเตือนไม่สำเร็จ ลองใหม่อีกครั้ง";
  }

  const when = parsed.repeat === "daily"
    ? `ทุกวัน ${formatThai(parsed.dueAt, false)} (เริ่ม ${formatThai(parsed.dueAt)})`
    : formatThai(parsed.dueAt);
  return `⏰ ตั้งเตือนแล้ว #${data.id}\n${when}\n“${parsed.text}”`;
}

async function listReminders(gid: string) {
  const { data, error } = await db
    .from("reminders")
    .select("id,message,due_at,repeat")
    .eq("group_id", gid)
    .lt("due_at", "infinity") // ข้ามรายการที่ reminder-tick กำลังส่งอยู่
    .order("due_at");
  if (error) {
    console.error(error);
    return "ดึงรายการเตือนไม่สำเร็จ";
  }
  if (!data.length) return "ยังไม่มีเตือนในกลุ่มนี้\nตั้งด้วย /เตือน 15:30 ข้อความ";
  const lines = data.map((r) => {
    const due = new Date(r.due_at);
    const when = r.repeat === "daily" ? `ทุกวัน ${formatThai(due, false)}` : formatThai(due);
    return `#${r.id} ${when} — ${r.message}`;
  });
  return `⏰ รายการเตือน (${data.length})\n${lines.join("\n")}\n\nลบด้วย /ลบเตือน <เลข>`;
}

async function deleteReminder(gid: string, args: string) {
  const id = Number(args.replace(/^#/, ""));
  if (!Number.isInteger(id) || id <= 0) return "❌ ระบุเลขเตือน เช่น /ลบเตือน 3 (ดูเลขได้จาก /รายการเตือน)";
  const { data, error } = await db
    .from("reminders")
    .delete()
    .eq("id", id)
    .eq("group_id", gid) // ลบได้เฉพาะของกลุ่มตัวเอง
    .select("message");
  if (error) {
    console.error(error);
    return "ลบไม่สำเร็จ ลองใหม่อีกครั้ง";
  }
  return data.length ? `🗑️ ลบเตือน #${id} แล้ว (“${data[0].message}”)` : `❌ ไม่พบเตือน #${id} ในกลุ่มนี้`;
}

async function stockText() {
  const { data, error } = await db.from("v_stock_status").select("*").neq("status", "ok");
  if (error) {
    console.error(error);
    return "ดึงข้อมูลสต็อกไม่สำเร็จ ลองใหม่อีกครั้ง";
  }
  return data?.length ? formatRows(data as Row[]) : "✅ ตอนนี้ไม่มีสินค้าใกล้หมด";
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
      await replyText(ev.replyToken, "สวัสดีครับ 👋 พิมพ์ /register ตามด้วยรหัส เพื่อเปิดใช้งานบอทในกลุ่มนี้");
      continue;
    }

    if (ev.type !== "message" || ev.message?.type !== "text") continue;
    const parsed = parseCommand(ev.message.text);
    if (!parsed) continue; // ไม่ได้ขึ้นต้นด้วย / = คุยกันปกติ ไม่ต้องทำอะไร
    const { cmd, args } = parsed;

    // /register <รหัส>  -> ผูกกลุ่มนี้กับระบบ
    if (cmd === "register") {
      const code = args.split(/\s+/)[0];
      if (code && code === Deno.env.get("REGISTER_CODE")) {
        await db.from("line_targets").upsert({ group_id: gid });
        await replyText(ev.replyToken, "✅ ลงทะเบียนกลุ่มนี้แล้ว\n\n" + HELP_TEXT);
      } else {
        await replyText(ev.replyToken, "❌ รหัสไม่ถูกต้อง");
      }
      continue;
    }

    // คำสั่งอื่น ใช้ได้เฉพาะกลุ่มที่ลงทะเบียนแล้ว
    if (!(await isRegistered(gid))) continue;

    let reply: string;
    if (STOCK_CMDS.includes(cmd)) reply = await stockText();
    else if (HELP_CMDS.includes(cmd)) reply = HELP_TEXT;
    else if (cmd === "เตือน") reply = await addReminder(gid, ev.source.userId ?? null, args, false);
    else if (cmd === "เตือนทุกวัน") reply = await addReminder(gid, ev.source.userId ?? null, args, true);
    else if (cmd === "รายการเตือน") reply = await listReminders(gid);
    else if (cmd === "ลบเตือน") reply = await deleteReminder(gid, args);
    else reply = `ไม่รู้จักคำสั่ง “/${cmd}” พิมพ์ /คำสั่ง เพื่อดูคำสั่งทั้งหมด`;

    await replyText(ev.replyToken, reply);
  }

  return new Response("ok");
});
