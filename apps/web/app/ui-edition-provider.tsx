"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { readUiEdition, UI_EDITION_COOKIE, type UiEdition } from "../lib/ui-edition";
import { useLanguage } from "./language-provider";

const EditionContext = createContext<{ edition: UiEdition; setEdition: (edition: UiEdition) => void }>({
  edition: "legacy",
  setEdition: () => undefined,
});

export function UiEditionProvider({ initialEdition, children }: { initialEdition: UiEdition; children: ReactNode }) {
  const [edition, updateEdition] = useState(initialEdition);

  useLayoutEffect(() => {
    const saved = readUiEdition(document.cookie);
    document.documentElement.dataset.uiEdition = saved;
    updateEdition(saved);
  }, []);

  function setEdition(next: UiEdition) {
    document.documentElement.dataset.uiEdition = next;
    updateEdition(next);
    document.cookie = `${UI_EDITION_COOKIE}=${next}; Max-Age=31536000; Path=/; SameSite=Lax`;
  }

  return <EditionContext.Provider value={{ edition, setEdition }}>{children}</EditionContext.Provider>;
}

export function useUiEdition() {
  return useContext(EditionContext);
}

export function UiEditionSwitcher() {
  const { edition, setEdition } = useUiEdition();
  const { locale } = useLanguage();
  const chinese = locale === "zh-CN";
  return <div className="edition-switcher" role="group" aria-label={chinese ? "界面版本" : "Interface edition"} translate="no">
    <button type="button" aria-pressed={edition === "legacy"} onClick={() => setEdition("legacy")}>{chinese ? "旧版" : "Legacy"}</button>
    <button type="button" aria-pressed={edition === "new"} onClick={() => setEdition("new")}>{chinese ? "新版" : "New"}</button>
  </div>;
}
