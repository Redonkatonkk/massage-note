"use client";

import { useId, type ReactNode } from "react";
import { appHref } from "../lib/demo-mode";
import { LanguageSwitcher, useLanguage } from "./language-provider";
import { UiEditionSwitcher } from "./ui-edition-provider";
import { useNativeDialog } from "./use-native-dialog";
import { BrandMark } from "./ui/primitives";

export function WorkspaceMenu({ links, workspace = false }: { links?: ReactNode; workspace?: boolean }) {
  const [dialog, dialogRef] = useNativeDialog();
  const titleId = useId();
  const { locale } = useLanguage();
  const chinese = locale === "zh-CN";
  const title = workspace ? (chinese ? "工作台导航" : "Workspace navigation") : (chinese ? "界面设置" : "Interface settings");

  return <div className={workspace ? "app-utility-bar workspace-toolbar" : "app-utility-bar utility-toolbar"}>
    <a className="workspace-brand" href={appHref("/")}><BrandMark />Massage note</a>
    <div className="workspace-utilities">
      <LanguageSwitcher />
      <button type="button" className="workspace-menu-trigger" aria-haspopup="dialog" aria-label={title} translate="no" onClick={() => dialog.current?.showModal()}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
      </button>
    </div>
    <dialog ref={dialogRef} className="workspace-menu" aria-labelledby={titleId} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="workspace-menu-body">
        <header className="modal-heading"><h2 id={titleId} translate="no">{title}</h2><button className="close-button" type="button" translate="no" onClick={() => dialog.current?.close()}>{chinese ? "关闭" : "Close"}</button></header>
        {links && <nav className="workspace-menu-links" aria-label={title} onClick={event => {
          if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.target instanceof Element && event.target.closest("a")) dialog.current?.close();
        }}>{links}</nav>}
        <div className="workspace-preferences"><LanguageSwitcher /><UiEditionSwitcher /></div>
      </div>
    </dialog>
  </div>;
}
