import type { Metadata, Viewport } from "next";
import { Inter, Prompt } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const prompt = Prompt({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["thai", "latin"],
  variable: "--font-prompt",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Coffee POS - Stock Management System",
  description: "ระบบจัดการสต็อกวัตถุดิบและภาชนะเปล่า (Tare Weight) สำหรับร้านกาแฟ",
};

// ให้คีย์บอร์ดมือถือขึ้นมาทับหน้าเว็บ แทนการย่อหน้าจอ (ไม่ต้องคำนวณ layout ใหม่ทุกเฟรมตอนคีย์บอร์ดเลื่อนขึ้น)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-visual",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${inter.variable} ${prompt.variable}`}>
      <body className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans antialiased selection:bg-[#8B5A2B]/10 selection:text-[#8B5A2B]">
        {children}
      </body>
    </html>
  );
}
