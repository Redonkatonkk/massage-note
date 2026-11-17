import type { Metadata } from "next";
import { DailySnapshotPreview } from "./daily-snapshot-preview";
import "../../daily-snapshot.css";

export const metadata: Metadata = {
  title: "Daily work card preview · 每日记工预览 | Massage note",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function DailySnapshotPreviewPage() {
  return <DailySnapshotPreview />;
}
