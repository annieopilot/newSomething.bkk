// supabase/functions/_shared/reminder.ts
// แปลงข้อความคำสั่ง /เตือน เป็นเวลา (เวลาไทย UTC+7 ไม่มี daylight saving)
const TZ_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;

export type ParsedReminder = { dueAt: Date; repeat: "none" | "daily"; text: string };

// ค่า "เวลาไทย" แทนด้วย Date ที่เลื่อนไป +7 ชม. แล้วอ่านด้วย getUTC*
const toTh = (d: Date) => new Date(d.getTime() + TZ_MS);
const fromThParts = (y: number, m: number, d: number, hh: number, mm: number) =>
  new Date(Date.UTC(y, m, d, hh, mm) - TZ_MS);

// คำบอกวัน เรียงยาวก่อน ("มะรืนนี้" ต้องมาก่อน "มะรืน")
const DAY_WORDS: [string, number][] = [["มะรืนนี้", 2], ["มะรืน", 2], ["พรุ่งนี้", 1], ["วันนี้", 0]];

// ส่งกลับ error เป็นข้อความภาษาไทย หรือผลที่แปลงแล้ว
export function parseReminder(args: string, daily: boolean, now = new Date()): ParsedReminder | string {
  let rest = args.trim();
  const th = toTh(now);
  const [y, mo, d] = [th.getUTCFullYear(), th.getUTCMonth(), th.getUTCDate()];

  if (rest.startsWith("ทุกวัน")) {
    daily = true;
    rest = rest.slice("ทุกวัน".length).trim();
  }

  // อีก 30 นาที / อีก 2 ชั่วโมง / อีก 2 ชม.
  if (!daily) {
    const rel = rest.match(/^อีก\s*(\d+)\s*(นาที|ชั่วโมง|ชม\.?)\s*(.*)$/s);
    if (rel) {
      const n = Number(rel[1]);
      const ms = n * (rel[2] === "นาที" ? 60_000 : 3600_000);
      if (n <= 0 || ms > 365 * DAY_MS) return "จำนวนเวลาไม่ถูกต้อง";
      return withText({ dueAt: new Date(now.getTime() + ms), repeat: "none" }, rel[3]);
    }
  }

  let dayOffset: number | null = null;
  let date: [number, number, number] | null = null;
  let yearGiven = false;

  // ส่วนวัน (ไม่บังคับ) — ไม่ต้องมีเว้นวรรคต่อท้ายก็ได้ เช่น "พรุ่งนี้9:00"
  if (!daily) {
    const word = DAY_WORDS.find(([w]) => rest.startsWith(w));
    if (word) {
      dayOffset = word[1];
      rest = rest.slice(word[0].length).trim();
    } else {
      const dm = rest.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*/);
      if (dm) {
        yearGiven = !!dm[3];
        let yr = dm[3] ? Number(dm[3]) : y;
        if (yr < 100) yr += 2000;
        if (yr > 2400) yr -= 543; // ปี พ.ศ.
        const dd = Number(dm[1]), mm = Number(dm[2]) - 1;
        const check = new Date(Date.UTC(yr, mm, dd));
        if (check.getUTCMonth() !== mm || check.getUTCDate() !== dd) return "วันที่ไม่ถูกต้อง";
        date = [yr, mm, dd];
        rest = rest.slice(dm[0].length);
      }
    }
  }

  // ส่วนเวลา (บังคับ): "15:30" "15.30" "9:00" "15:30 น." แล้วตามด้วยข้อความ
  const cm = rest.match(/^(\d{1,2})[:.](\d{2})\s*(?:น\.|น(?=\s|$))?\s*([\s\S]*)$/);
  if (!cm) return "ไม่พบเวลา (ใช้รูปแบบ 15:30)";
  const hh = Number(cm[1]), mi = Number(cm[2]);
  if (hh > 23 || mi > 59) return "เวลาไม่ถูกต้อง";
  const text = cm[3];

  let due: Date;
  if (date) {
    due = fromThParts(date[0], date[1], date[2], hh, mi);
    // ไม่ระบุปีแล้ววันที่ผ่านไปแล้ว = ปีหน้า
    if (due <= now && !yearGiven) {
      due = fromThParts(date[0] + 1, date[1], date[2], hh, mi);
    }
    if (due <= now) return "เวลานี้ผ่านไปแล้ว";
  } else {
    due = fromThParts(y, mo, d + (dayOffset ?? 0), hh, mi);
    if (due <= now) {
      if (dayOffset !== null && dayOffset > 0) return "เวลานี้ผ่านไปแล้ว";
      if (dayOffset === 0) return "เวลานี้ของวันนี้ผ่านไปแล้ว";
      due = new Date(due.getTime() + DAY_MS); // ไม่ระบุวัน + เลยเวลาแล้ว = พรุ่งนี้
    }
  }
  return withText({ dueAt: due, repeat: daily ? "daily" : "none" }, text);
}

function withText(r: Omit<ParsedReminder, "text">, text: string): ParsedReminder | string {
  const t = text.trim();
  if (!t) return "ยังไม่ได้ใส่ข้อความที่จะให้เตือน";
  if (t.length > 300) return "ข้อความยาวเกิน 300 ตัวอักษร";
  return { ...r, text: t };
}

// รอบถัดไปของเตือนทุกวัน ที่อยู่หลัง now
export function nextDaily(due: Date, now = new Date()) {
  let t = due.getTime();
  while (t <= now.getTime()) t += DAY_MS;
  return new Date(t);
}

export function formatThai(d: Date, withDate = true) {
  return d.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    ...(withDate ? { day: "numeric", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }) + " น.";
}

// ตัวอย่างสั้น ใช้ตอนตั้งเตือนผิดรูปแบบ
export const REMINDER_EXAMPLES = [
  "• /เตือน 15:30 โทรหาซัพ",
  "• /เตือน พรุ่งนี้ 9:00 เช็คของเข้า",
  "• /เตือน 5/11 10:00 จ่ายบิล",
  "• /เตือน อีก 30 นาที ไปรับของ",
  "• /เตือนทุกวัน 17:00 นับสต็อก",
].join("\n");

export const REMINDER_HELP = [
  "⏰ ตั้งเตือน",
  "/เตือน [วัน] เวลา ข้อความ",
  REMINDER_EXAMPLES,
  "",
  "วันใส่หรือไม่ใส่ก็ได้: วันนี้ / พรุ่งนี้ / มะรืน / 5/11",
  "ไม่ใส่วัน = วันนี้ (ถ้าเลยเวลาแล้วจะเป็นพรุ่งนี้)",
  "เวลาใช้ 15:30 หรือ 15.30 (แบบ 24 ชม.)",
  "",
  "📋 จัดการเตือน",
  "• /รายการเตือน — ดูเตือนทั้งหมด พร้อมเลขที่",
  "• /ลบเตือน 3 — ลบเตือนเลขที่ 3",
].join("\n");
