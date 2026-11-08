// supabase/functions/_shared/receive.ts
// คำสั่ง /รับ — บันทึกของรับเข้า (stock_movements ประเภท purchase) จากข้อความใน LINE
// และ /ยกเลิกรับ — ลบรอบล่าสุดภายใน 15 นาที
//
// ของรับเข้าเป็นของใหม่ยังไม่แกะ: พิมพ์ปริมาณสุทธิ ไม่หักภาชนะ
// ถ้าสินค้าแยกจุดนับ trigger ในฐานข้อมูลจะบวกเข้าจุดเก็บของรับเข้า (หลังร้าน) ให้เอง
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const UNDO_MINUTES = 15;
const MAX_LINES = 30;

export const RECEIVE_HELP = [
  "📥 รับของเข้า (ใส่ปริมาณสุทธิ ไม่ต้องหักภาชนะ)",
  "• /รับ มัจฉะ 1 กก.",
  "• หลายรายการ: ขึ้นบรรทัดใหม่ หรือคั่นด้วย ,",
  "   /รับ",
  "   มัจฉะ 1 กก. 1200บ",
  "   นมสด 6 ขวด",
  "• ใส่ราคารวมท้ายบรรทัดได้ (ไม่ใส่ก็ได้) เช่น 1200บ",
  `• /ยกเลิกรับ — ย้อนรอบล่าสุด (ภายใน ${UNDO_MINUTES} นาที)`,
].join("\n");

export type ItemRow = {
  id: number;
  sku: string | null;
  name: string;
  unit_code: string;
  purchase_unit_code: string | null;
  purchase_pack_size: number | null;
  current_stock: number;
};
export type UnitRow = { code: string; name_th: string; name_en: string | null };

// คำเรียกหน่วยที่คนพิมพ์บ่อย → units.code (ชื่อจากตาราง units ถูกเพิ่มให้อัตโนมัติด้วย)
const UNIT_ALIASES: Record<string, string> = {
  g: "g", gr: "g", gram: "g", "ก.": "g", "กรัม": "g",
  kg: "kg", "กก": "kg", "กก.": "kg", "กิโล": "kg", "กิโลกรัม": "kg", "โล": "kg",
  ml: "ml", cc: "ml", "มล": "ml", "มล.": "ml", "ซีซี": "ml", "มิลลิลิตร": "ml",
  l: "l", "ล.": "l", "ลิตร": "l",
  "แพ็ค": "pack", "แพค": "pack", "แพ็ก": "pack", "ห่อ": "pack",
  "ซอง": "bag", "ถุง": "bag",
  "อัน": "piece", "ชิ้น": "piece",
};
// หน่วยที่แปลงกันได้ตรงๆ (ตัวคูณเทียบหน่วยฐาน)
const FACTORS: Record<string, { kind: string; f: number }> = {
  g: { kind: "mass", f: 1 },
  kg: { kind: "mass", f: 1000 },
  ml: { kind: "volume", f: 1 },
  l: { kind: "volume", f: 1000 },
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const num = (s: string) => Number(s.replace(/,/g, ""));
export const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 3 });

export type ParsedLine = { raw: string; query: string; qty: number; unitWord: string | null; price: number | null };

/** แยกข้อความเป็นรายการ: ขึ้นบรรทัดใหม่ / ", " / ";" */
export function splitLines(args: string): string[] {
  return args
    .split(/\n|;|,\s+/)
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

/** "มัจฉะ 1.5 กก. 1200บ" → { query: "มัจฉะ", qty: 1.5, unitWord: "กก.", price: 1200 } */
export function parseLine(raw: string): ParsedLine | string {
  let s = raw.trim();
  let price: number | null = null;

  const priceMatch = s.match(/\s*(?:@\s*|฿\s*)?(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|บ\.?|฿)\s*$/) ??
    s.match(/\s*@\s*(\d[\d,]*(?:\.\d+)?)\s*$/);
  if (priceMatch) {
    price = num(priceMatch[1]);
    s = s.slice(0, priceMatch.index).trim();
  }

  const m = s.match(/^(.+?)\s*[x×*]?\s*(\d[\d,]*(?:\.\d+)?)\s*([^\d]*)$/);
  if (!m || !m[1].trim()) return `“${raw}” ไม่มีจำนวน (เช่น มัจฉะ 1 กก.)`;
  const qty = num(m[2]);
  if (!(qty > 0)) return `“${raw}” จำนวนต้องมากกว่า 0`;
  const unitWord = m[3].trim() || null;
  return { raw, query: m[1].trim(), qty, unitWord, price };
}

export function buildUnitLookup(units: UnitRow[]): Map<string, string> {
  const map = new Map<string, string>(Object.entries(UNIT_ALIASES));
  for (const u of units) {
    for (const word of [u.code, u.name_th, u.name_en]) if (word) map.set(word.toLowerCase(), u.code);
  }
  return map;
}

function resolveUnit(word: string, lookup: Map<string, string>): string | null {
  const w = word.toLowerCase();
  return lookup.get(w) ?? lookup.get(w.replace(/\.$/, "")) ?? null;
}

/** จำนวนที่พิมพ์ → จำนวนในหน่วยนับของสินค้า หรือข้อความ error */
export function toItemUnit(qty: number, unitCode: string | null, item: ItemRow, unitName: (code: string) => string): number | string {
  if (!unitCode || unitCode === item.unit_code) return qty;
  const from = FACTORS[unitCode];
  const to = FACTORS[item.unit_code];
  if (from && to && from.kind === to.kind) return Math.round((qty * from.f / to.f) * 1000) / 1000;
  if (unitCode === item.purchase_unit_code && item.purchase_pack_size) {
    return Math.round(qty * Number(item.purchase_pack_size) * 1000) / 1000;
  }
  return `หน่วย “${unitName(unitCode)}” แปลงเป็น${unitName(item.unit_code)}ไม่ได้` +
    (FACTORS[unitCode] ? "" : " (ตั้งหน่วยซื้อ/ขนาดบรรจุในแอปก่อน หรือพิมพ์เป็น" + unitName(item.unit_code) + ")");
}

/** หาสินค้าจากคำที่พิมพ์: SKU → ชื่อตรง → ชื่อที่มีคำนี้ → คำที่พิมพ์มีชื่อสินค้าอยู่ (เอาชื่อยาวสุด) */
export function matchItem(query: string, items: ItemRow[]): ItemRow | ItemRow[] {
  const q = norm(query);
  const bySku = items.find((i) => i.sku && norm(i.sku) === q);
  if (bySku) return bySku;
  const exact = items.filter((i) => norm(i.name) === q);
  if (exact.length === 1) return exact[0];
  const contains = items.filter((i) => norm(i.name).includes(q));
  if (contains.length === 1) return contains[0];
  if (contains.length > 1) return contains;
  const within = items.filter((i) => q.includes(norm(i.name)));
  if (within.length === 0) return [];
  const longest = Math.max(...within.map((i) => norm(i.name).length));
  const best = within.filter((i) => norm(i.name).length === longest);
  return best.length === 1 ? best[0] : best;
}

type Planned = { item: ItemRow; qty: number; unitCost: number | null; line: string };

/** /รับ ... → บันทึก แล้วคืนข้อความตอบกลับ */
export async function receiveText(
  db: SupabaseClient,
  groupId: string,
  userId: string | null,
  displayName: string | null,
  args: string,
): Promise<string> {
  const lines = splitLines(args);
  if (lines.length === 0) return RECEIVE_HELP;
  if (lines.length > MAX_LINES) return `❌ ส่งได้ครั้งละไม่เกิน ${MAX_LINES} รายการ`;

  const [itemsRes, unitsRes] = await Promise.all([
    db.from("items")
      .select("id,sku,name,unit_code,purchase_unit_code,purchase_pack_size,current_stock")
      .eq("is_active", true),
    db.from("units").select("code,name_th,name_en"),
  ]);
  if (itemsRes.error || unitsRes.error) {
    console.error(itemsRes.error ?? unitsRes.error);
    return "ดึงรายการสินค้าไม่สำเร็จ ลองใหม่อีกครั้ง";
  }
  const items = (itemsRes.data ?? []) as ItemRow[];
  const units = (unitsRes.data ?? []) as UnitRow[];
  const lookup = buildUnitLookup(units);
  const unitName = (code: string) => units.find((u) => u.code === code)?.name_th ?? code;

  const planned: Planned[] = [];
  const errors: string[] = [];
  for (const line of lines) {
    const parsed = parseLine(line);
    if (typeof parsed === "string") {
      errors.push(parsed);
      continue;
    }
    const match = matchItem(parsed.query, items);
    if (Array.isArray(match)) {
      errors.push(
        match.length === 0
          ? `“${parsed.query}” ไม่พบสินค้า`
          : `“${parsed.query}” ตรงหลายรายการ: ${match.slice(0, 5).map((i) => i.name).join(", ")}${match.length > 5 ? " ..." : ""}`,
      );
      continue;
    }
    let unitCode: string | null = null;
    if (parsed.unitWord) {
      unitCode = resolveUnit(parsed.unitWord, lookup);
      if (!unitCode) {
        errors.push(`“${line}” ไม่รู้จักหน่วย “${parsed.unitWord}”`);
        continue;
      }
    }
    const qty = toItemUnit(parsed.qty, unitCode, match, unitName);
    if (typeof qty === "string") {
      errors.push(`${match.name}: ${qty}`);
      continue;
    }
    planned.push({
      item: match,
      qty,
      unitCost: parsed.price != null ? Math.round((parsed.price / qty) * 10000) / 10000 : null,
      line,
    });
  }

  const errorBlock = errors.length
    ? `\n\n⚠️ ไม่ได้บันทึก (${errors.length})\n${errors.map((e) => `• ${e}`).join("\n")}`
    : "";
  if (planned.length === 0) return `❌ ไม่ได้บันทึกอะไรเลย${errorBlock}\n\nวิธีใช้:\n${RECEIVE_HELP}`;

  const note = `รับเข้าผ่าน LINE${displayName ? ` โดย ${displayName}` : ""}`;
  const { data: moves, error } = await db
    .from("stock_movements")
    .insert(planned.map((p) => ({
      item_id: p.item.id,
      movement_type: "purchase",
      quantity: p.qty,
      unit_cost: p.unitCost,
      note,
    })))
    .select("id");
  if (error || !moves) {
    console.error(error);
    return "บันทึกรับเข้าไม่สำเร็จ ลองใหม่อีกครั้ง";
  }

  const { data: receipt, error: receiptErr } = await db
    .from("line_receipts")
    .insert({ group_id: groupId, user_id: userId, display_name: displayName, movement_ids: moves.map((m) => m.id) })
    .select("id")
    .single();
  if (receiptErr) console.error("line_receipts insert failed", receiptErr);

  // ยอดก่อน → หลัง (สินค้าเดียวกันหลายบรรทัด บวกต่อกัน)
  const running = new Map<number, number>();
  const okLines = planned.map((p) => {
    const before = running.get(p.item.id) ?? Number(p.item.current_stock);
    const after = Math.round((before + p.qty) * 1000) / 1000;
    running.set(p.item.id, after);
    const cost = p.unitCost != null ? ` @${fmt(p.unitCost)}฿` : "";
    return `✅ ${p.item.name} +${fmt(p.qty)} ${unitName(p.item.unit_code)} (${fmt(before)} → ${fmt(after)})${cost}`;
  });

  const undo = receipt ? `\n\nผิด? พิมพ์ /ยกเลิกรับ ภายใน ${UNDO_MINUTES} นาที` : "";
  return `📥 รับเข้าแล้ว ${planned.length} รายการ${receipt ? ` (#${receipt.id})` : ""}\n${okLines.join("\n")}${errorBlock}${undo}`;
}

/** /ยกเลิกรับ [เลข] → ลบ movement ของรอบล่าสุด (หรือรอบที่ระบุ) ในกลุ่มนี้ ภายใน 15 นาที */
export async function undoReceiveText(db: SupabaseClient, groupId: string, args: string): Promise<string> {
  const since = new Date(Date.now() - UNDO_MINUTES * 60_000).toISOString();
  const id = Number(args.trim().replace(/^#/, ""));

  let q = db.from("line_receipts")
    .select("id,movement_ids")
    .eq("group_id", groupId)
    .is("undone_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  if (args.trim()) {
    if (!Number.isInteger(id) || id <= 0) return "❌ ระบุเลขรอบ เช่น /ยกเลิกรับ 12 หรือพิมพ์ /ยกเลิกรับ เฉยๆ เพื่อย้อนรอบล่าสุด";
    q = q.eq("id", id);
  }
  const { data, error } = await q;
  if (error) {
    console.error(error);
    return "ยกเลิกไม่สำเร็จ ลองใหม่อีกครั้ง";
  }
  const receipt = data?.[0];
  if (!receipt) return `❌ ไม่มีรอบรับเข้า${args.trim() ? ` #${id}` : ""}ที่ยกเลิกได้ (ยกเลิกได้ภายใน ${UNDO_MINUTES} นาที) — แก้ในแอปแทนได้`;

  // กันกดซ้ำพร้อมกัน: จองรอบนี้ก่อน แล้วค่อยลบ
  const { data: claimed } = await db.from("line_receipts")
    .update({ undone_at: new Date().toISOString() })
    .eq("id", receipt.id)
    .is("undone_at", null)
    .select("id");
  if (!claimed?.length) return `รอบ #${receipt.id} ถูกยกเลิกไปแล้ว`;

  const { data: moves } = await db.from("stock_movements")
    .select("quantity, items(name)")
    .in("id", receipt.movement_ids);
  const { error: delErr } = await db.from("stock_movements").delete().in("id", receipt.movement_ids);
  if (delErr) {
    console.error(delErr);
    await db.from("line_receipts").update({ undone_at: null }).eq("id", receipt.id);
    return "ยกเลิกไม่สำเร็จ ลองใหม่อีกครั้ง";
  }

  // deno-lint-ignore no-explicit-any
  const names = (moves ?? []).map((r: any) => `• ${r.items?.name ?? "?"} −${fmt(Number(r.quantity))}`);
  return `↩️ ยกเลิกรับเข้า #${receipt.id} แล้ว\n${names.join("\n")}`;
}
