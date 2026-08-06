import type { Metadata } from "next";
import { ProfilePageClient } from "./profile-page-client";

export const metadata: Metadata = { title: "我的 · Massage note" };

export default function ProfilePage() {
  return <ProfilePageClient />;
}
