// supabase/functions/_shared/stock-history.ts
// คำสั่ง /ยอด — ดูยอดสต็อกและมูลค่าที่บันทึกไว้ตอน 23:59 ของแต่ละวัน (ตาราง stock_daily_snapshots)
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const TZ_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;
const MAX_ITEM_LINES = 40;

export const HISTORY_HELP = [
  "📊 ยอดสต็อกย้อนหลัง (บันทึกทุกวัน 23:59)",
  "• /ยอด — ยอดล่าสุดที่บันทึกไว้",
  "• /ยอด เมื่อวาน",
  "• /ยอด 5/11  หรือ  /ยอด 5/11/2569",
].join("\n");

const iso = (d: Date) => d.toISOString().slice(0, 10);
// วันที่ปัจจุบันตามเวลาไทย (เป็น Date เที่ยงคืน UTC ของวันนั้น)
const todayTh = (now: Date) => {
  const th = new Date(now.getTime() + TZ_MS);
  return new Date(Date.UTC(th.getUTCFullYear(), th.getUTCMonth(), th.getUTCDate()));
};

// "" -> null (ล่าสุด) / "เมื่อวาน" / "วันนี้" / "5/11" / "5/11/2569" / "5/11/69" / "2026-11-05"
// ส่งกลับวันที่ "YYYY-MM-DD", null = ล่าสุด, หรือข้อความ error
export function parseHistoryDate(args: string, now = new Date()): string | null | { error: string } {
  const s = args.trim();
  if (!s) return null;
  const today = todayTh(now);
  if (s.startsWith("เมื่อวาน")) return iso(new Date(today.getTime() - DAY_MS));
  if (s.startsWith("วันนี้")) return iso(today);

  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dm = isoMatch ? null : s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!isoMatch && !dm) return { error: "รูปแบบวันที่ไม่ถูกต้อง" };

  let yr: number, mm: number, dd: number;
  if (isoMatch) {
    [yr, mm, dd] = [Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])];
  } else {
    dd = Number(dm![1]);
    mm = Number(dm![2]) - 1;
    if (dm![3]) {
      yr = Number(dm![3]);
      if (yr < 100) yr += yr >= 50 ? 2500 : 2000; // 69 = พ.ศ. 2569, 26 = ค.ศ. 2026
    } else {
      yr = today.getUTCFullYear();
    }
  }
  if (yr > 2400) yr -= 543; // ปี พ.ศ.

  let d = new Date(Date.UTC(yr, mm, dd));
  if (d.getUTCMonth() !== mm || d.getUTCDate() !== dd) return { error: "วันที่ไม่ถูกต้อง" };
  // ไม่ระบุปี แล้ววันที่อยู่ในอนาคต = หมายถึงปีที่แล้ว
  if (!isoMatch && !dm![3] && d > today) d = new Date(Date.UTC(yr - 1, mm, dd));
  return iso(d);
}

const baht = (n: number) =>
  "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const qty = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 3 });
const thaiDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("th-TH", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

type SnapshotRow = {
  snapshot_date: string;
  item_name: string;
  unit: string | null;
  quantity: number;
  stock_value: number;
  status: "ok" | "low" | "out";
  is_backfill: boolean;
};

export async function stockHistoryText(db: SupabaseClient, args: string): Promise<string> {
  const parsed = parseHistoryDate(args);
  if (parsed && typeof parsed === "object") return `❌ ${parsed.error}\n\n${HISTORY_HELP}`;

  // หาวันที่จะแสดง: ล่าสุดที่มี หรือวันที่ระบุ
  let date = parsed;
  if (!date) {
    const { data, error } = await db
      .from("stock_daily_snapshots")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error(error);
      return "ดึงยอดย้อนหลังไม่สำเร็จ ลองใหม่อีกครั้ง";
    }
    if (!data) return "ยังไม่มียอดที่บันทึกไว้ ระบบบันทึกทุกวันเวลา 23:59";
    date = data.snapshot_date as string;
  }

  const { data, error } = await db
    .from("stock_daily_snapshots")
    .select("snapshot_date,item_name,unit,quantity,stock_value,status,is_backfill")
    .eq("snapshot_date", date)
    .order("stock_value", { ascending: false });
  if (error) {
    console.error(error);
    return "ดึงยอดย้อนหลังไม่สำเร็จ ลองใหม่อีกครั้ง";
  }
  const rows = (data ?? []) as SnapshotRow[];
  if (!rows.length) {
    const today = iso(todayTh(new Date()));
    return date === today
      ? "ยอดของวันนี้จะบันทึกตอน 23:59 ดูยอดล่าสุดด้วย /ยอด"
      : `ไม่มียอดของวันที่ ${thaiDate(date)}\n(เริ่มเก็บข้อมูลตั้งแต่ 1 พ.ย. 2569)`;
  }

  const total = rows.reduce((s, r) => s + Math.max(0, Number(r.stock_value)), 0);
  const low = rows.filter((r) => r.status === "low").length;
  const out = rows.filter((r) => r.status === "out").length;
  const mark = (r: SnapshotRow) => (r.status === "out" ? "🔴 " : r.status === "low" ? "🟠 " : "");

  const lines = [
    `📊 ยอดสต็อก ${thaiDate(date)}`,
    `💰 มูลค่ารวม ${baht(total)}`,
    `📦 ${rows.length} รายการ · 🟠 ใกล้หมด ${low} · 🔴 หมด ${out}`,
  ];
  if (rows.some((r) => r.is_backfill)) lines.push("ℹ️ ยอดของวันนี้คำนวณย้อนหลัง มูลค่าคิดจากราคาปัจจุบัน");
  lines.push("", "เรียงตามมูลค่า:");
  rows.slice(0, MAX_ITEM_LINES).forEach((r) =>
    lines.push(`• ${mark(r)}${r.item_name} ${qty(Number(r.quantity))}${r.unit ? " " + r.unit : ""} = ${baht(Number(r.stock_value))}`)
  );
  if (rows.length > MAX_ITEM_LINES) lines.push(`…และอีก ${rows.length - MAX_ITEM_LINES} รายการ (ดูทั้งหมดในหน้าเว็บ)`);
  return lines.join("\n");
}
