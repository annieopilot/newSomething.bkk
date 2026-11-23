// supabase/functions/_shared/excel-export.ts
// คำสั่ง /excel — สร้างไฟล์ Excel จากข้อมูลล่าสุด เก็บใน Supabase Storage (bucket "exports" แบบส่วนตัว)
// แล้วตอบเป็นลิงก์ดาวน์โหลดที่หมดอายุใน 24 ชม. (LINE bot ส่งไฟล์แนบตรงๆ ไม่ได้)
// ต้องรัน supabase/excel_export.sql ก่อน (สร้าง bucket)
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

export const EXCEL_CMDS = ["excel", "เอ็กเซล", "เอ็กเซล์", "ไฟล์"];
export const EXCEL_HELP = [
  "📎 ไฟล์ Excel",
  "• /excel — ลิงก์ดาวน์โหลด (ใช้ได้ 24 ชม.)",
  "  มี 3 ชีต: สต๊อกตอนนี้ · ประวัติเข้า-ออก 30 วัน · ยอดรายวัน",
].join("\n");

const BUCKET = "exports";
const FOLDER = "line";
const LINK_TTL_SEC = 24 * 3600;
const KEEP_FILES_MS = 2 * 86_400_000; // ไฟล์เก่ากว่านี้ลบทิ้งตอนสร้างไฟล์ใหม่
const HISTORY_DAYS = 30;
const PAGE = 1000; // PostgREST คืนได้ครั้งละ 1000 แถว
const TZ_MS = 7 * 3600_000;

const STATUS_TH: Record<string, string> = { ok: "ปกติ", low: "ใกล้หมด", out: "หมด" };
const TYPE_TH: Record<string, string> = {
  opening: "เปิดยอด",
  purchase: "รับเข้า",
  usage: "ใช้ไป",
  sale: "ขาย",
  waste: "เสีย/ทิ้ง",
  count: "นับสต๊อก",
  adjustment: "ปรับยอด",
};

const num = (v: unknown) => (v == null ? null : Number(v));
// เวลาไทย "2026-11-13 18:21"
const thTime = (iso: string) => new Date(new Date(iso).getTime() + TZ_MS).toISOString().slice(0, 16).replace("T", " ");
const thDate = (d = new Date()) => new Date(d.getTime() + TZ_MS).toISOString().slice(0, 10);
const baht = (n: number) => "฿" + n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

function sheet(rows: Record<string, unknown>[], widths: number[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  return ws;
}

async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

type InventoryRow = {
  sku: string | null; name: string; category: string | null; unit: string; current_stock: number;
  cost_per_unit: number; stock_value: number; reorder_point: number; status: string; supplier: string | null;
  last_movement_at: string | null;
};
type MovementRow = {
  occurred_at: string; movement_type: string; quantity: number; unit_cost: number | null; note: string | null;
  items: { name: string; sku: string | null; units: { name_th: string } | null } | null;
};
type DailyRow = {
  snapshot_date: string; total_value: number; item_count: number; low_count: number; out_count: number;
  is_backfill: boolean;
};

async function buildWorkbook(db: SupabaseClient) {
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
  const [inventory, movements, daily] = await Promise.all([
    fetchAll<InventoryRow>((a, b) =>
      db.from("v_inventory")
        .select("sku,name,category,unit,current_stock,cost_per_unit,stock_value,reorder_point,status,supplier,last_movement_at")
        .eq("is_active", true).order("category").order("name").range(a, b)
    ),
    fetchAll<MovementRow>((a, b) =>
      db.from("stock_movements")
        // items ผูกกับ units 2 ทาง (หน่วยนับ / หน่วยซื้อ) ต้องระบุ FK ไม่งั้น PostgREST ไม่รู้จะใช้ทางไหน (PGRST201)
        .select("occurred_at,movement_type,quantity,unit_cost,note,items(name,sku,units!items_unit_code_fkey(name_th))")
        .gte("occurred_at", since).order("occurred_at", { ascending: false }).order("id", { ascending: false })
        .range(a, b)
    ),
    fetchAll<DailyRow>((a, b) =>
      db.from("v_stock_daily_totals")
        .select("snapshot_date,total_value,item_count,low_count,out_count,is_backfill")
        .order("snapshot_date", { ascending: false }).range(a, b)
    ),
  ]);

  const totalValue = inventory.reduce((s, r) => s + Math.max(0, Number(r.stock_value)), 0);

  const stockRows: Record<string, unknown>[] = inventory.map((r) => ({
    "SKU": r.sku ?? "",
    "สินค้า": r.name,
    "หมวด": r.category ?? "",
    "หน่วย": r.unit,
    "คงเหลือ": num(r.current_stock),
    "ราคาทุน/หน่วย": num(r.cost_per_unit),
    "มูลค่า (บาท)": num(r.stock_value),
    "จุดสั่งซื้อ": num(r.reorder_point),
    "สถานะ": STATUS_TH[r.status] ?? r.status,
    "ผู้ขาย": r.supplier ?? "",
    "เคลื่อนไหวล่าสุด": r.last_movement_at ? thTime(r.last_movement_at) : "",
  }));
  stockRows.push({ "สินค้า": `รวม ${inventory.length} รายการ`, "มูลค่า (บาท)": Math.round(totalValue * 100) / 100 });

  const historyRows = movements.map((m) => ({
    "วันเวลา": thTime(m.occurred_at),
    "สินค้า": m.items?.name ?? "",
    "SKU": m.items?.sku ?? "",
    "ประเภท": TYPE_TH[m.movement_type] ?? m.movement_type,
    "จำนวน (+เข้า / −ออก)": num(m.quantity),
    "หน่วย": m.items?.units?.name_th ?? "",
    "ราคาต่อหน่วย": num(m.unit_cost),
    "หมายเหตุ": m.note ?? "",
  }));

  const dailyRows = daily.map((d) => ({
    "วันที่": d.snapshot_date,
    "มูลค่ารวม (บาท)": num(d.total_value),
    "จำนวนรายการ": num(d.item_count),
    "ใกล้หมด": num(d.low_count),
    "หมด": num(d.out_count),
    "หมายเหตุ": d.is_backfill ? "คำนวณย้อนหลัง (มูลค่าคิดจากราคาปัจจุบัน)" : "",
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(stockRows, [8, 30, 12, 10, 10, 13, 13, 11, 10, 18, 17]), "สต๊อกตอนนี้");
  XLSX.utils.book_append_sheet(
    wb,
    sheet(historyRows.length ? historyRows : [{ "วันเวลา": `ไม่มีรายการใน ${HISTORY_DAYS} วันที่ผ่านมา` }], [17, 30, 8, 11, 18, 10, 13, 50]),
    `ประวัติ ${HISTORY_DAYS} วัน`,
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheet(dailyRows.length ? dailyRows : [{ "วันที่": "ยังไม่มียอดรายวัน (บันทึกทุกคืน 23:59)" }], [12, 16, 13, 10, 8, 38]),
    "ยอดรายวัน",
  );

  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return { bytes, totalValue, itemCount: inventory.length, movementCount: movements.length, dayCount: daily.length };
}

// ลบไฟล์เก่า (ลิงก์หมดอายุไปแล้ว) — ลบไม่ได้ก็ไม่เป็นไร
async function cleanupOldFiles(db: SupabaseClient) {
  try {
    const { data } = await db.storage.from(BUCKET).list(FOLDER, { limit: 1000 });
    const old = (data ?? [])
      .filter((f) => f.created_at && Date.now() - new Date(f.created_at).getTime() > KEEP_FILES_MS)
      .map((f) => `${FOLDER}/${f.name}`);
    if (old.length) await db.storage.from(BUCKET).remove(old);
  } catch (e) {
    console.warn("cleanup failed", String(e));
  }
}

export async function excelExportText(db: SupabaseClient): Promise<string> {
  try {
    const wb = await buildWorkbook(db);
    const fileName = `stock-${thDate()}.xlsx`;
    const path = `${FOLDER}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.xlsx`;

    const { error: upErr } = await db.storage.from(BUCKET).upload(path, wb.bytes, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });
    if (upErr) throw upErr;

    const { data: signed, error: signErr } = await db.storage.from(BUCKET)
      .createSignedUrl(path, LINK_TTL_SEC, { download: fileName });
    if (signErr || !signed) throw signErr ?? new Error("no signed url");

    await cleanupOldFiles(db);

    return [
      `📎 ไฟล์สต๊อก ${thDate()}`,
      `💰 มูลค่ารวม ${baht(wb.totalValue)} · ${wb.itemCount} รายการ`,
      "",
      "📄 ในไฟล์มี 3 ชีต",
      `• สต๊อกตอนนี้ (${wb.itemCount} รายการ)`,
      `• ประวัติเข้า-ออก ${HISTORY_DAYS} วัน (${wb.movementCount} รายการ)`,
      `• ยอดรายวัน (${wb.dayCount} วัน)`,
      "",
      "⬇️ กดดาวน์โหลด (ลิงก์ใช้ได้ 24 ชม.)",
      signed.signedUrl,
    ].join("\n");
  } catch (e) {
    console.error("excel export failed", e);
    const msg = String((e as { message?: string })?.message ?? e);
    if (/bucket not found/i.test(msg)) return "❌ ยังไม่ได้ตั้งค่าที่เก็บไฟล์ — รัน supabase/excel_export.sql ใน Supabase ก่อน";
    return "❌ สร้างไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง";
  }
}
