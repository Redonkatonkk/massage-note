import type { Metadata } from "next";
import { SharedDailySnapshot } from "./shared-daily-snapshot";
import "../../daily-snapshot.css";

export const metadata: Metadata = {
  title: "每日记工 · Daily work card | Massage note",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function SharedDailySnapshotPage() {
  return <SharedDailySnapshot />;
}
