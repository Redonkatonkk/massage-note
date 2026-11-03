import { Suspense } from "react";
import type { Metadata } from "next";
import { SharedSettlement } from "./shared-settlement";
import "./settlement-share.css";

export const metadata: Metadata = {
  title: "工资结算 · Payroll statement | Massage note",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function SettlementSharePage() {
  return <Suspense fallback={<main className="settlement-share"><p role="status">正在读取结算单…</p></main>}><SharedSettlement /></Suspense>;
}
