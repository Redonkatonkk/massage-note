"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  type AppLocale,
  isAppLocale,
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  translateText,
} from "../lib/i18n";

interface LanguageContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (value: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: "zh-CN",
  setLocale: () => undefined,
  t: (value) => value,
});

const textSources = new WeakMap<Text, { source: string; translated: string }>();
const attributeSources = new WeakMap<Element, Map<string, { source: string; translated: string }>>();
const translatedAttributes = ["aria-label", "aria-description", "alt", "placeholder", "title"];

function translateTextNode(node: Text, locale: AppLocale) {
  if (node.parentElement?.closest("script, style")) return;
  const current = node.nodeValue ?? "";
  const saved = textSources.get(node);
  const source = saved && (current === saved.source || current === saved.translated)
    ? saved.source
    : current;
  const translated = translateText(source, locale);
  textSources.set(node, { source, translated });
  if (current !== translated) node.nodeValue = translated;
}

function translateElementAttributes(element: Element, locale: AppLocale) {
  let savedAttributes = attributeSources.get(element);
  if (!savedAttributes) {
    savedAttributes = new Map();
    attributeSources.set(element, savedAttributes);
  }
  for (const attribute of translatedAttributes) {
    const current = element.getAttribute(attribute);
    if (current === null) continue;
    const saved = savedAttributes.get(attribute);
    const source = saved && (current === saved.source || current === saved.translated)
      ? saved.source
      : current;
    const translated = translateText(source, locale);
    savedAttributes.set(attribute, { source, translated });
    if (current !== translated) element.setAttribute(attribute, translated);
  }
}

function translateTree(root: Node, locale: AppLocale) {
  if (root instanceof Text) {
    translateTextNode(root, locale);
    return;
  }
  if (root instanceof Element) translateElementAttributes(root, locale);
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text) translateTextNode(node, locale);
    else if (node instanceof Element) translateElementAttributes(node, locale);
    node = walker.nextNode();
  }
}

export function LanguageProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: AppLocale;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    translateTree(document.documentElement, locale);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") translateTree(mutation.target, locale);
        else if (mutation.type === "attributes") translateTree(mutation.target, locale);
        else mutation.addedNodes.forEach((node) => translateTree(node, locale));
      }
    });
    observer.observe(document.documentElement, {
      attributeFilter: translatedAttributes,
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [locale]);

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isAppLocale(stored) && stored !== locale) {
      setLocaleState(stored);
      document.cookie = `${LOCALE_COOKIE}=${stored}; Max-Age=31536000; Path=/; SameSite=Lax`;
    }
  }, []);

  useEffect(() => {
    const originalPrompt = window.prompt.bind(window);
    const originalConfirm = window.confirm.bind(window);
    window.prompt = (message?: string, defaultValue?: string) => originalPrompt(
      message === undefined ? undefined : translateText(message, locale),
      defaultValue,
    );
    window.confirm = (message?: string) => originalConfirm(
      message === undefined ? undefined : translateText(message, locale),
    );
    return () => {
      window.prompt = originalPrompt;
      window.confirm = originalConfirm;
    };
  }, [locale]);

  function setLocale(next: AppLocale) {
    setLocaleState(next);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    document.cookie = `${LOCALE_COOKIE}=${next}; Max-Age=31536000; Path=/; SameSite=Lax`;
  }

  const value = useMemo<LanguageContextValue>(() => ({
    locale,
    setLocale,
    t: (text) => translateText(text, locale),
  }), [locale]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
      <div className="language-switcher" role="group" aria-label={locale === "zh-CN" ? "选择语言" : "Choose language"}>
        <button
          className={locale === "zh-CN" ? "active" : ""}
          type="button"
          aria-pressed={locale === "zh-CN"}
          onClick={() => setLocale("zh-CN")}
        >
          中文
        </button>
        <button
          className={locale === "en-US" ? "active" : ""}
          type="button"
          aria-pressed={locale === "en-US"}
          onClick={() => setLocale("en-US")}
        >
          English
        </button>
      </div>
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
