/** ยอดรวมของหนึ่งวัน (จาก v_stock_daily_totals) */
export interface DailyStockTotal {
  date: string; // YYYY-MM-DD ตามเวลาไทย
  itemCount: number;
  totalValue: number;
  lowCount: number;
  outCount: number;
  /** true = คำนวณย้อนหลังจากประวัติ มูลค่าคิดจากราคาปัจจุบัน */
  isBackfill: boolean;
}

/** ยอดของสินค้าหนึ่งรายการในวันที่เลือก (จาก stock_daily_snapshots) */
export interface StockSnapshotItem {
  itemId: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  quantity: number;
  costPerUnit: number;
  stockValue: number;
  reorderPoint: number;
  status: 'ok' | 'low' | 'out';
}

/** เปรียบเทียบสินค้าหนึ่งรายการระหว่างวันเริ่มกับวันสิ้นสุด */
export interface StockComparisonItem {
  itemId: string;
  name: string;
  category: string | null;
  unit: string;
  /** null = ยังไม่มีสินค้านี้ในวันเริ่ม / ไม่มีแล้วในวันสิ้นสุด */
  fromQty: number | null;
  toQty: number | null;
  fromValue: number;
  toValue: number;
  /** รับเข้า (opening + purchase) ในช่วงนั้น */
  receivedQty: number;
  receivedValue: number;
  /** ที่บันทึกว่าใช้/ขาย/เสีย (เป็นบวก) */
  recordedUsageQty: number;
  /** ส่วนต่างจากการนับ/ปรับยอด (ติดลบ = นับได้น้อยกว่าในระบบ) */
  countAdjustQty: number;
  /** ใช้ไปโดยประมาณ = ยอดเริ่ม + รับเข้า − ยอดสิ้นสุด */
  usedQty: number;
  usedValue: number;
  costPerUnit: number;
}

export interface StockComparison {
  from: string;
  to: string;
  fromTotal: number;
  toTotal: number;
  receivedValue: number;
  /** ผลรวมของรายการที่ใช้ไป (usedValue > 0) */
  usedValue: number;
  /** ผลรวมของรายการที่ยอดเพิ่มเกินที่รับเข้า (usedValue < 0) เช่น นับได้มากกว่าในระบบ */
  surplusValue: number;
  items: StockComparisonItem[];
}
