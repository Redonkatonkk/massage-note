"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, errorMessage } from "../../lib/api";
import type { MeResponse } from "../../lib/types";
import { AppNav } from "../app-nav";

export function ProfilePageClient() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [storeSaved, setStoreSaved] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);

  const load = useCallback(async () => {
    const profile = await apiRequest<MeResponse>("/me");
    setMe(profile);
    setFirstName(profile.firstName ?? "");
    setLastName(profile.lastName ?? "");
    setSelectedStoreId((current) => {
      const remembered = current || window.localStorage.getItem("massage_note_store_id") || "";
      return profile.memberships.some((membership) => membership.store.id === remembered)
        ? remembered
        : (profile.memberships[0]?.store.id ?? "");
    });
  }, []);

  useEffect(() => {
    void load().catch((caught) => {
      if ((caught as { status?: number }).status === 401) window.location.replace("/login");
      else setProfileError(errorMessage(caught));
    });
  }, [load]);

  if (!me) return <main className="center-page"><div className="loading-card"><span className="spinner" /><strong>{profileError || "正在加载个人资料…"}</strong></div></main>;

  const selectedMembership = me.memberships.find((membership) => membership.store.id === selectedStoreId);
  const roleText = { OWNER: "店主", MANAGER: "经理", EMPLOYEE: "员工" } as const;
  return (
    <main className="app-shell manage-shell">
      <header className="topbar"><div><p className="eyebrow">账号与偏好</p><h1>我的</h1><p className="business-date">{me.phoneE164}</p></div><a className="store-switcher header-link" href="/help">使用帮助</a></header>
      <section className="manage-section profile-layout">
        <form className="manage-card" onSubmit={(event) => {
          event.preventDefault();
          setProfileBusy(true); setProfileError(""); setProfileSaved(false);
          void apiRequest("/me/profile", { method: "PATCH", body: { firstName, lastName } })
            .then(async () => { await load(); setProfileSaved(true); })
            .catch((caught) => setProfileError(errorMessage(caught)))
            .finally(() => setProfileBusy(false));
        }}>
          <div className="manage-heading"><div><p className="eyebrow">个人资料</p><h2>姓名</h2></div></div>
          <div className="manage-form-grid profile-name-grid"><label>名<input autoComplete="given-name" required maxLength={50} value={firstName} onChange={(event) => { setFirstName(event.target.value); setProfileSaved(false); }} /></label><label>姓<input autoComplete="family-name" required maxLength={50} value={lastName} onChange={(event) => { setLastName(event.target.value); setProfileSaved(false); }} /></label></div>
          {profileSaved && <p className="success-notice" role="status">个人资料已保存</p>}
          {profileError && <p className="form-error" role="alert">{profileError}</p>}
          <button className="primary-action" type="submit" disabled={profileBusy}>{profileBusy ? "正在保存…" : "保存个人资料"}</button>
        </form>
        <section className="manage-card">
          <div className="manage-heading"><div><p className="eyebrow">当前工作区</p><h2>切换店铺</h2></div></div>
          {me.memberships.length > 0 ? <>
            <label>当前店铺<select value={selectedStoreId} onChange={(event) => {
              const storeId = event.target.value;
              setSelectedStoreId(storeId);
              window.localStorage.setItem("massage_note_store_id", storeId);
              setStoreSaved(true);
            }}>{me.memberships.map((membership) => <option key={membership.id} value={membership.store.id}>{membership.store.name} · {roleText[membership.role]}</option>)}</select></label>
            <p className="field-help">今日、财务和店铺设置都会使用这里选择的店铺。{selectedMembership ? `当前身份：${roleText[selectedMembership.role]}。` : ""}</p>
            {storeSaved && <p className="success-notice" role="status">当前店铺已切换</p>}
            <a className="primary-action button-link" href="/">进入所选店铺</a>
          </> : <p className="field-help">你目前还没有加入任何店铺。回到今日页面可以创建店铺或申请加入。</p>}
        </section>
        <form className="manage-card" onSubmit={(event) => {
          event.preventDefault();
          setPasswordError(""); setPasswordSaved(false);
          if (newPassword !== confirmPassword) { setPasswordError("两次输入的新密码不一致"); return; }
          setPasswordBusy(true);
          void apiRequest("/me/password", {
            method: "PATCH",
            body: { ...(me.hasPassword ? { currentPassword } : {}), newPassword },
          }).then(async () => {
            setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
            await load(); setPasswordSaved(true);
          }).catch((caught) => setPasswordError(errorMessage(caught))).finally(() => setPasswordBusy(false));
        }}>
          <div className="manage-heading"><div><p className="eyebrow">账号安全</p><h2>{me.hasPassword ? "修改密码" : "首次设置密码"}</h2></div></div>
          <p className="field-help">{me.hasPassword ? "修改前需要验证当前密码。新密码设置成功后即可用于手机号加密码登录。" : "这个账号是通过验证码注册的，还没有密码。验证过的当前登录状态可以直接设置一个新密码。"}</p>
          <div className="manage-form-grid password-form-grid">
            {me.hasPassword && <label>当前密码<input type="password" autoComplete="current-password" required minLength={8} maxLength={72} value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setPasswordSaved(false); }} /></label>}
            <label>新密码<input type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setPasswordSaved(false); }} /></label>
            <label>再次输入新密码<input type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setPasswordSaved(false); }} /></label>
          </div>
          {passwordSaved && <p className="success-notice" role="status">密码已更新</p>}
          {passwordError && <p className="form-error" role="alert">{passwordError}</p>}
          <button className="primary-action" type="submit" disabled={passwordBusy}>{passwordBusy ? "正在更新…" : (me.hasPassword ? "确认修改密码" : "设置密码")}</button>
        </form>
        <section className="manage-card"><div className="manage-heading"><div><p className="eyebrow">登录状态</p><h2>退出账号</h2></div></div><p className="field-help">退出后，这台设备会保留经过验证的登录状态。下次输入同一手机号码时可以直接登录，减少验证码短信。</p><button className="secondary-action" type="button" disabled={signOutBusy} onClick={() => { setSignOutBusy(true); void apiRequest("/auth/session", { method: "DELETE" }).finally(() => window.location.replace("/login")); }}>{signOutBusy ? "正在退出…" : "退出"}</button></section>
      </section>
      <AppNav active="profile" storeId={selectedStoreId || undefined} />
    </main>
  );
}
