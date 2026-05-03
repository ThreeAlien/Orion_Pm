import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orion PM",
  description: "輕量專案管理 — 任務、專案、文件、甘特圖一站搞定",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-TW" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
