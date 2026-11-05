import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import "./globals.css";
import "./design-system.css";
import "./responsive.css";
import "./new-edition.css";
import { UI_EDITION_COOKIE, parseUiEdition } from "../lib/ui-edition";
import { UiEditionProvider } from "./ui-edition-provider";
import { WorkspaceMenu } from "./workspace-menu";
import { DecisionProvider } from "./decision-dialog";
import { isAppLocale } from "../lib/i18n";
import { LanguageProvider } from "./language-provider";
import { NetworkStatus } from "./network-status";
import { ScrollBoundaryGuard } from "./scroll-boundary-guard";
import { isPortfolioDemo } from "../lib/demo-mode";
import { DemoBanner } from "./demo-banner";

export const metadata: Metadata = {
  title: "Massage note",
  description: "按摩店记工与财务管理系统 / Massage work-record and finance management",
  applicationName: "Massage note",
  icons: {
    icon: [{ url: `${process.env.NEXT_PUBLIC_APP_BASE_PATH ?? ""}/app-icon.svg`, type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f5f3",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const preferences = isPortfolioDemo ? undefined : await cookies();
  const savedLocale = isPortfolioDemo ? "en-US" : preferences?.get("massage_note_locale")?.value;
  const edition = parseUiEdition(preferences?.get(UI_EDITION_COOKIE)?.value);
  const initialLocale = isAppLocale(savedLocale) ? savedLocale : "zh-CN";
  return (
    <html lang={initialLocale} data-ui-edition={edition} suppressHydrationWarning={isPortfolioDemo}>
      <head>{isPortfolioDemo && <script dangerouslySetInnerHTML={{ __html: `if (/(^|; *)${UI_EDITION_COOKIE}=new(;|$)/.test(document.cookie)) document.documentElement.dataset.uiEdition = "new";` }} />}</head>
      <body>
        <LanguageProvider initialLocale={initialLocale}>
          <UiEditionProvider initialEdition={edition}>
            <DecisionProvider>
              {isPortfolioDemo && <DemoBanner />}
              <WorkspaceMenu />
              <NetworkStatus />
              <ScrollBoundaryGuard />
              {children}
            </DecisionProvider>
          </UiEditionProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
