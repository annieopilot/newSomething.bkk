// เทียบ Google Sheets ระบบเดิม (Products + StockSummary + Movements) กับเว็บ (Supabase) — อ่านอย่างเดียว ไม่เปลี่ยนอะไร
// วิธีใช้:  node scripts/compare-sheet-vs-web.mjs [วันตัดยอด เช่น 2026-11-15]
//   - ดึงชีตสดผ่าน gviz CSV (ชีตแชร์แบบใครมีลิงก์ก็ดูได้ ไม่ต้อง login)
//   - ดึงเว็บด้วย `npx supabase db query --remote --read-only` (ต้อง link โปรเจกต์ไว้แล้ว)
//   - ส่วนที่ 1: ข้อมูลสินค้า (ชื่อ/sku/หมวด/หน่วย/ราคา/จุดสั่งซื้อ/ผู้ขาย/สถานะ) + ยอดคงเหลือ + มูลค่ารวม
//   - ส่วนที่ 2 (ถ้าใส่วันตัดยอด): ยอดในชีต "ก่อนวันนั้น" (ไล่ Movements) เทียบกับเว็บ
//     ใช้ดูว่าส่วนต่างมาจากรายการที่ชีตบันทึกหลังวันนั้นเท่านั้น หรือต่างกันมาก่อนแล้ว
// กติกาการอ่านชีต ดู docs/legacy-stock-excel.md
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SHEET_ID = "1c56bOQiRrJZjn8UITRzfUlhlIVVOlTdt5633muriYxg";
const DUP = "P_1793615352134481"; // "แก้วร้อนน" — ในเว็บรวมเข้า "แก้วร้อน" (001) แล้ว
const SKIP = new Set(["002", DUP]);
const cutoff = process.argv[2];

function parseCsv(t) {
  const rows = []; let r = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { r.push(f); f = ""; }
    else if (c === "\n") { r.push(f); rows.push(r); r = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || r.length) { r.push(f); rows.push(r); }
  const h = rows.shift();
  return rows.map((x) => Object.fromEntries(h.map((k, j) => [k, x[j] ?? ""])));
}
async function sheet(name) {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${name}`);
  if (!res.ok) throw new Error(`ดึงชีต ${name} ไม่ได้: ${res.status}`);
  return parseCsv(await res.text());
}
function webItems() {
  const sql = `select i.id, i.legacy_id, i.sku, i.name, c.name as category, u.name_th as unit, i.cost_per_unit,
    i.reorder_point, s.name as supplier, i.is_active, i.current_stock
    from items i left join item_categories c on c.id = i.category_id left join units u on u.code = i.unit_code
    left join suppliers s on s.id = i.default_supplier_id`;
  // ส่ง SQL เป็นไฟล์ (-f) เพราะบน Windows ต้องใช้ shell: true ซึ่งทำให้ SQL ที่มีช่องว่าง/ขึ้นบรรทัดใหม่เพี้ยน
  const file = path.join(os.tmpdir(), `compare-sheet-vs-web-${process.pid}.sql`);
  fs.writeFileSync(file, sql);
  try {
    const out = execFileSync("npx", ["supabase", "db", "query", "--remote", "--read-only", "-o", "json", "-f", `"${file}"`],
      { encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "inherit"] });
    return JSON.parse(out.slice(out.indexOf("{"))).rows;
  } finally {
    fs.rmSync(file, { force: true });
  }
}

const [P, S, M] = await Promise.all([sheet("Products"), sheet("StockSummary"), sheet("Movements")]);
const W = webItems();
const ss = Object.fromEntries(S.map((r) => [String(r.product_id), r]));
const web = Object.fromEntries(W.filter((w) => w.legacy_id).map((w) => [w.legacy_id, w]));
const num = (x) => (x === "" || x == null ? null : Number(x));
const norm = (s) => (s ?? "").toString().replace(/\s+/g, "").toLowerCase();
// ยอดในชีตของสินค้า (แก้วร้อน = แก้วร้อน + แก้วร้อนน)
const sheetStock = (id, get) => (id === "001" ? (get("001") ?? 0) + (get(DUP) ?? 0) : get(id) ?? 0);

console.log(`ชีต: Products ${P.length} แถว, Movements ${M.length} แถว, ล่าสุด ${M.map((m) => m.created_at).sort().at(-1)}`);
console.log("\n== 1) สินค้า + ยอดคงเหลือปัจจุบัน (เว็บ → ชีต) ==");
let sheetVal = 0, webVal = 0, n = 0;
const seen = new Set();
for (const p of P) {
  const id = String(p.product_id);
  if (!p.product_name || SKIP.has(id)) continue;
  const stock = sheetStock(id, (k) => num(ss[k]?.current_stock));
  sheetVal += stock * num(p.cost);
  const w = web[id];
  if (!w) { console.log(`[ไม่มีในเว็บ] ${id} ${p.product_name} ยอด ${stock}`); n++; continue; }
  seen.add(id);
  const d = [];
  if (Number(w.current_stock) !== stock) d.push(`ยอด ${+w.current_stock} → ${stock}`);
  if (Number(w.cost_per_unit) !== num(p.cost)) d.push(`ราคาทุน ${+w.cost_per_unit} → ${p.cost}`);
  if (Number(w.reorder_point) !== num(p.reorder_point)) d.push(`จุดสั่งซื้อ ${+w.reorder_point} → ${p.reorder_point}`);
  if (w.name !== p.product_name) d.push(`ชื่อ "${w.name}" → "${p.product_name}"`);
  if (p.sku && String(w.sku) !== String(p.sku)) d.push(`sku ${w.sku} → ${p.sku}`);
  if ((w.category ?? "") !== p.category) d.push(`หมวด ${w.category} → ${p.category}`);
  if ((w.unit ?? "") !== p.unit) d.push(`หน่วย ${w.unit} → ${p.unit}`);
  if (p.supplier && norm(w.supplier) !== norm(p.supplier)) d.push(`ผู้ขาย ${w.supplier} → ${p.supplier}`);
  if (w.is_active !== (p.status === "Active")) d.push(`ใช้งาน ${w.is_active} → ${p.status}`);
  if (d.length) { console.log(`${p.product_name} (${id}): ${d.join("; ")}`); n++; }
}
for (const w of W) {
  if (w.is_active) webVal += Number(w.current_stock) * Number(w.cost_per_unit);
  if (w.is_active && !seen.has(w.legacy_id)) { console.log(`[มีแต่ในเว็บ] id=${w.id} ${w.name} ยอด ${+w.current_stock}`); n++; }
}
if (!n) console.log("(ตรงกันทุกรายการ)");
const ssTotal = S.reduce((a, r) => a + (num(r.stock_value) || 0), 0);
console.log(`มูลค่า: ชีต ${sheetVal.toFixed(2)} (StockSummary.stock_value รวม ${ssTotal.toFixed(2)}) | เว็บ ${webVal.toFixed(2)} | ต่าง ${(webVal - sheetVal).toFixed(2)}`);

// ตรวจว่าอ่าน Movements ถูก: ไล่ยอด (IN +q, OUT −q, ADJUST = q) ต้องได้เท่า StockSummary ทุกตัว
const ids = new Set(S.map((s) => String(s.product_id)));
const sorted = [...M].sort((a, b) => a.created_at.localeCompare(b.created_at));
function replay(before) {
  const st = {};
  for (const m of sorted) {
    const id = String(m.product_id);
    if ((before && m.created_at >= before) || !ids.has(id)) continue;
    const q = Number(m.quantity);
    st[id] = m.movement_type === "IN" ? (st[id] ?? 0) + q : m.movement_type === "OUT" ? (st[id] ?? 0) - q : q;
  }
  return st;
}
const all = replay();
const bad = S.filter((s) => s.product_name && (all[s.product_id] ?? 0) !== Number(s.current_stock));
if (bad.length) console.log(`\n!! ไล่ Movements ไม่ตรง StockSummary ${bad.length} ตัว: ${bad.map((s) => s.product_name).join(", ")} — ตรวจวิธีอ่านก่อนเชื่อผล`);

if (cutoff) {
  console.log(`\n== 2) ยอดชีตก่อน ${cutoff} เทียบเว็บ (ตัวที่ไม่ตรง = ต่างกันตั้งแต่ก่อนวันนั้น) ==`);
  const st = replay(cutoff);
  let k = 0;
  for (const s of S) {
    const id = String(s.product_id);
    if (!s.product_name || SKIP.has(id) || !web[id]) continue;
    const a = sheetStock(id, (x) => st[x]);
    if (a !== Number(web[id].current_stock)) { console.log(`${s.product_name}: ชีต ${a} | เว็บ ${+web[id].current_stock}`); k++; }
  }
  if (!k) console.log("(ตรงกันทุกรายการ — ส่วนต่างในข้อ 1 มาจากรายการที่ชีตบันทึกตั้งแต่วันนั้นเท่านั้น)");
  console.log(`\nรายการในชีตตั้งแต่ ${cutoff}:`);
  const name = Object.fromEntries(P.map((p) => [String(p.product_id), p.product_name]));
  for (const m of sorted.filter((m) => m.created_at >= cutoff))
    console.log(`  ${m.created_at} ${name[m.product_id] ?? m.product_id} ${m.movement_type} ${m.quantity} → ${m.stock_after} (${m.recorded_by})`);
}
