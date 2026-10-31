export type InventoryTab = 'supplies' | 'stock';

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  tareWeight: number; // จุดประสงค์ระบบ: ชั่งตัดภาชนะ (ถ้ายังไม่มีใน db ให้ default 0 เพื่อรอสร้าง column ทีหลัง)
  currentStock: number;
  minStockLevel: number;
  category: string | null;
  costPerUnit?: number | null;
  price?: number | null;
  barcode?: string | null;
  supplier?: string | null;
  notes?: string | null;
  sourceTable: 'supplies' | 'stock';
  packageQuantity?: number | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IngredientInput {
  name: string;
  unit: string;
  tareWeight: number;
  currentStock: number;
  minStockLevel: number;
  category?: string;
  costPerUnit?: number;
  price?: number;
  barcode?: string;
  supplier?: string;
  packageQuantity?: number;
  notes?: string;
  sourceTable?: 'supplies' | 'stock';
}

export interface InventoryStats {
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  categoriesCount: number;
  totalEstimatedValue: number;
}

export const COMMON_CATEGORIES = [
  'Packaging',
  'Supply',
  'Coffee',
  'Matcha',
  'NON-COFF',
  'Cake',
  'Bakery',
  'Combo set',
] as const;

export const COMMON_UNITS = [
  { label: 'ชิ้น / ใบ / อัน (Pcs/ใบ/อัน)', value: 'ใบ' },
  { label: 'แก้ว (Cup)', value: 'Cup' },
  { label: 'หน่วย (หน่วย)', value: 'หน่วย' },
  { label: 'กิโลกรัม (kg)', value: 'kg' },
  { label: 'ห่อ / ซอง (ห่อ)', value: 'ห่อ' },
  { label: 'ม้วน (ม้วน)', value: 'ม้วน' },
  { label: 'ถุง (ถุง)', value: 'ถุง' },
  { label: 'ขวด (ขวด)', value: 'ขวด' },
  { label: 'กรัม (g)', value: 'g' },
  { label: 'มิลลิลิตร (ml)', value: 'ml' },
] as const;

