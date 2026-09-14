import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "半刻 · 在线聊天",
  description: "留半刻时间，和朋友聊聊天。创建房间，邀请朋友，随时交流。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
