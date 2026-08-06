import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { PwaRegister } from "./pwa-register";

export const metadata: Metadata = {
  title: "Massage note",
  description: "按摩店记工与财务管理系统",
  applicationName: "Massage note",
  icons: {
    icon: [{ url: "/app-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/app-icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Massage note",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#fffaf3",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body><PwaRegister />{children}</body>
    </html>
  );
}
