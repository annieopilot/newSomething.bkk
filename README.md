# NATEE Stock

ระบบสต๊อกร้านกาแฟ — เว็บสำหรับนับ/รับเข้า/ดูยอดย้อนหลัง และบอท LINE สำหรับแจ้งเตือนของใกล้หมดและบันทึกรับของจากแชท

- **เว็บ:** Next.js 16 (App Router, Cache Components) + Tailwind CSS 4 — deploy บน Vercel
- **ฐานข้อมูล / Auth / Storage:** Supabase (Postgres + RLS + pg_cron)
- **บอท LINE:** Supabase Edge Functions (Deno)

## ทำอะไรได้บ้าง

| ส่วน | หน้าที่ |
|---|---|
| หน้าแรก `/` | รายการสต๊อก ค้นหา/กรอง ปรับยอด ชั่งหักภาชนะ และ **เลือกวันดูยอดย้อนหลัง** (ยอด ณ สิ้นวัน ดูอย่างเดียว) |
| `/count` | นับสต๊อกทีละบรรทัดบนมือถือ — แยกนับหลายจุดได้ ระบบจำยอดของแต่ละจุดตอนนับล่าสุด |
| `/history` | ใช้ของไปเท่าไหร่ในช่วงที่เลือก + ของเหลือแต่ละวัน |
| `/order` | ของที่หมด/ใกล้หมด แยกตามร้านที่ซื้อ |
| บอท LINE | `/สต็อก` `/ยอด` `/รับ` `/ยกเลิกรับ` `/excel` `/เตือน` `/เตือนทุกวัน` `/รายการเตือน` `/ลบเตือน` `/ช่วย` + แจ้งเตือนอัตโนมัติเมื่อของใกล้หมด |

ยอดสต๊อกเก็บแบบบัญชี: ทุกการเปลี่ยนแปลงเป็นแถวใน `stock_movements` แล้ว trigger ปรับ `items.current_stock` ให้เอง
และบันทึกยอดทุกสินค้าทุกคืน 23:59 ลง `stock_daily_snapshots`

## เริ่มใช้งานบนเครื่อง

```bash
npm install
cp .env.example .env        # ใส่ URL และ key ของ Supabase
npm run dev                 # http://localhost:3000
```

| คำสั่ง | |
|---|---|
| `npm run dev` | เปิด dev server (มือถือในวง Wi-Fi เดียวกันเปิดผ่าน IP เครื่องได้) |
| `npm run build` | build production |
| `npm run lint` | ตรวจโค้ดด้วย ESLint |

## โครงสร้างโฟลเดอร์

```
app/                  หน้าเว็บ (App Router) + server actions (app/actions/)
components/           คอมโพเนนต์ UI แยกตามหน้า (dashboard/, history/, auth/)
lib/                  Supabase client, auth, ฟังก์ชันช่วยคำนวณ
types/                TypeScript types
proxy.ts              ตรวจ session ก่อนเข้าหน้า (Next.js proxy)
supabase/
  schema/             SQL โครงสร้างฐานข้อมูล — รันซ้ำได้ เรียงตามเลข 01 → 06
  one-off/            SQL แก้/นำเข้าข้อมูลครั้งเดียว ชื่อขึ้นต้นด้วยวันที่ (เก็บเป็นประวัติ ไม่ต้องรันซ้ำ)
  archive/            SQL เก่าที่เลิกใช้แล้ว (เก็บไว้อ้างอิง)
  functions/          Edge Functions: line-webhook, stock-alert, reminder-tick (+ _shared/)
  config.toml         ค่าตั้ง Supabase CLI
scripts/              สคริปต์ช่วย เช่น เทียบ Google Sheets ระบบเดิมกับเว็บ
docs/                 คู่มือและ backlog
data/legacy/          ไฟล์ export จากระบบเดิม (CSV/XLSX) — อยู่ในเครื่องเท่านั้น ไม่ขึ้น git
```

## ฐานข้อมูล

ตั้งค่าโปรเจกต์ใหม่: รันไฟล์ใน `supabase/schema/` ทีละไฟล์ตามลำดับเลขใน Supabase SQL Editor
(หรือ `npx supabase db query --remote -f supabase/schema/<ไฟล์>.sql`)

| ไฟล์ | สร้างอะไร |
|---|---|
| `01_line_bot.sql` | ตารางของบอท LINE (กลุ่มที่ลงทะเบียน, สถานะแจ้งเตือน, ตัวเตือน) + ตั้งเวลา cron |
| `02_inventory.sql` | สินค้า หมวด หน่วย ผู้ขาย ประวัติเข้า-ออก trigger views RLS audit log |
| `03_stock_history.sql` | ยอดรายวัน + cron บันทึกทุกคืน 23:59 |
| `04_count_locations.sql` | จุดนับของแต่ละสินค้า (น้ำหนักภาชนะ, ยอดนับล่าสุด) |
| `05_line_receive.sql` | ฟังก์ชันรับของเข้าจาก LINE (`/รับ`) |
| `06_excel_export.sql` | bucket เก็บไฟล์ของคำสั่ง `/excel` |

ไฟล์ใน `one-off/` ที่มีข้อมูลร้าน (ชื่อพนักงาน) ถูก `.gitignore` ไว้ — อยู่ในเครื่องเท่านั้น

## Deploy

- **เว็บ:** push ขึ้น `main` แล้ว Vercel build และ deploy ให้อัตโนมัติ (ตั้ง env ตาม `.env.example` ใน Vercel)
- **บอท LINE:** `npx supabase functions deploy line-webhook --no-verify-jwt` (ทำเช่นเดียวกันกับ `stock-alert`, `reminder-tick`)
  ค่าลับของบอทตั้งด้วย `npx supabase secrets set --env-file .env.line` (ดูตัวอย่างใน `.env.line.example`)

## ข้อมูลจากระบบเดิม (Google Sheets)

ร้านเคยใช้ Google Sheets + Apps Script ก่อนย้ายมาเว็บนี้ — ก่อนแตะข้อมูลระบบเดิมให้อ่าน [`docs/legacy-stock-excel.md`](docs/legacy-stock-excel.md)
เทียบชีตออนไลน์กับเว็บ: `node scripts/compare-sheet-vs-web.mjs <วันตัดยอด>` (อ่านอย่างเดียว)
