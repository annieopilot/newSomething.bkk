// supabase/functions/_shared/line.ts
const API = "https://api.line.me/v2/bot";
const token = () => Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;

export type Row = {
  product_id: string;
  name: string;
  sku: string | null;
  quantity: number;
  reorder_point: number;
  status: "ok" | "low" | "out";
};

// ตรวจลายเซ็นจาก LINE ว่าคำขอมาจาก LINE จริง (HMAC-SHA256 ด้วย Channel secret)
export async function verifySignature(body: string, signature: string | null) {
  if (!signature) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(Deno.env.get("LINE_CHANNEL_SECRET")!),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const sig = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(body));
  } catch {
    return false;
  }
}

export async function lineGet(path: string) {
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!r.ok) throw new Error(`LINE GET ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}

// reply ไม่นับโควตา แต่ใช้ได้เฉพาะตอบเหตุการณ์ที่เพิ่งเข้ามา (replyToken หมดอายุเร็ว)
export async function replyText(replyToken: string, text: string) {
  const r = await fetch(`${API}/message/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
  });
  if (!r.ok) console.error("reply failed", r.status, await r.text());
}

// push นับโควตา (นับตามจำนวนสมาชิกในกลุ่ม)
export async function pushText(to: string, text: string) {
  const r = await fetch(`${API}/message/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      "X-Line-Retry-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
  });
  if (!r.ok) console.error("push failed", r.status, await r.text());
  return r.ok;
}

// เช็กก่อนว่าโควตาเดือนนี้พอไหม (ถ้าเช็กไม่ได้ ให้ลองส่งไปเลย LINE จะปฏิเสธเองถ้าเกิน)
export async function canPush(groupId: string) {
  try {
    const quota = await lineGet("/message/quota");
    if (quota.type !== "limited") return { ok: true };
    const used = (await lineGet("/message/quota/consumption")).totalUsage as number;
    let members = Number(Deno.env.get("GROUP_SIZE_FALLBACK") ?? 10);
    try {
      members = (await lineGet(`/group/${groupId}/members/count`)).count;
    } catch (e) {
      console.warn("members count unavailable, using fallback", String(e));
    }
    return { ok: used + members <= quota.value, used, members, limit: quota.value as number };
  } catch (e) {
    console.warn("quota check failed", String(e));
    return { ok: true };
  }
}

export function formatRows(rows: Row[]) {
  const out = rows.filter((r) => r.status === "out");
  const low = rows.filter((r) => r.status === "low");
  const lines: string[] = [];
  if (out.length) {
    lines.push(`🔴 หมดแล้ว (${out.length})`);
    out.slice(0, 25).forEach((r) => lines.push(`• ${r.name}`));
  }
  if (low.length) {
    if (lines.length) lines.push("");
    lines.push(`🟠 ใกล้หมด (${low.length})`);
    low.slice(0, 25).forEach((r) => lines.push(`• ${r.name} เหลือ ${r.quantity} (จุดสั่งซื้อ ${r.reorder_point})`));
  }
  return lines.join("\n");
}