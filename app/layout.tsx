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
    // โหมดมืดเป็นค่าเริ่มต้น; ถ้าเคยเลือกสว่าง (localStorage "theme") สคริปต์ใน <head> สลับก่อนวาดหน้า — ดู components/ThemeToggle.tsx
    <html lang="th" data-theme="dark" className={`${inter.variable} ${prompt.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem("theme")==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-page text-ink font-sans antialiased selection:bg-accent/10 selection:text-accent">
        {children}
      </body>
    </html>
  );
}
