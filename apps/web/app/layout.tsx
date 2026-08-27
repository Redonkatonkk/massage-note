import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import "./globals.css";
import { isAppLocale } from "../lib/i18n";
import { LanguageProvider } from "./language-provider";
import { NetworkStatus } from "./network-status";
import { ScrollBoundaryGuard } from "./scroll-boundary-guard";

export const metadata: Metadata = {
  title: "Massage note",
  description: "按摩店记工与财务管理系统 / Massage work-record and finance management",
  applicationName: "Massage note",
  icons: {
    icon: [{ url: "/app-icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#fffaf3",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const savedLocale = (await cookies()).get("massage_note_locale")?.value;
  const initialLocale = isAppLocale(savedLocale) ? savedLocale : "zh-CN";
  return (
    <html lang={initialLocale}>
      <body><LanguageProvider initialLocale={initialLocale}><NetworkStatus /><ScrollBoundaryGuard />{children}</LanguageProvider></body>
    </html>
  );
}
