"use client";

import {
  RecaptchaVerifier,
  signInWithCustomToken,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import { firebaseAuth } from "../../lib/firebase-client";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

type LoginStep = "phone" | "password" | "code" | "register" | "setup-password";
type AccountStatus = { exists: boolean; hasPassword: boolean };

class LoginApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

function displayPhone(value: string): string {
  if (value.length <= 3) return value;
  if (value.length <= 6) return `(${value.slice(0, 3)}) ${value.slice(3)}`;
  return `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
}

function loginError(caught: unknown, fallback: string): string {
  if (caught instanceof LoginApiError) return caught.message;
  const code = typeof caught === "object" && caught !== null && "code" in caught ? String((caught as { code: unknown }).code) : "";
  const messages: Record<string, string> = {
    "auth/invalid-phone-number": "手机号码格式不正确，请输入 10 位美国号码",
    "auth/too-many-requests": "发送或验证次数过多，请稍后再试",
    "auth/quota-exceeded": "短信发送已达到服务限额，请稍后联系店长",
    "auth/captcha-check-failed": "安全验证未通过，请刷新页面后重试",
    "auth/invalid-app-credential": "安全验证凭据无效，请刷新页面后重试",
    "auth/missing-app-credential": "安全验证凭据缺失，请刷新页面后重试",
    "auth/app-not-authorized": "当前网站尚未获得 Firebase 登录授权，请联系系统管理员",
    "auth/operation-not-allowed": "Firebase 尚未启用手机号码登录，请联系系统管理员",
    "auth/billing-not-enabled": "Firebase 项目尚未启用短信登录所需的结算，请联系系统管理员",
    "auth/code-expired": "验证码已过期，请重新发送",
    "auth/invalid-verification-code": "验证码不正确，请检查后重试",
    "auth/network-request-failed": "网络连接失败，请检查网络后重试",
    "auth/wrong-password": "密码不正确，请检查后重试",
  };
  return messages[code] ?? (code ? `${fallback}（${code}）` : fallback);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | { code?: string; messageZh?: string }
    | null;
  if (!response.ok) {
    throw new LoginApiError(payload?.code ?? "LOGIN_FAILED", payload?.messageZh ?? "登录失败，请重新尝试");
  }
  return payload as T;
}

export function LoginForm() {
  const developmentLoginEnabled = process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED === "true";
  const [phoneDigits, setPhoneDigits] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [step, setStep] = useState<LoginStep>("phone");
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [verifiedIdToken, setVerifiedIdToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  useEffect(() => () => verifierRef.current?.clear(), []);

  function validatePhone(): boolean {
    if (phoneDigits.length === 10) return true;
    setError("请输入完整的 10 位美国手机号码");
    return false;
  }

  async function bootstrapSession(idToken: string, extra: Record<string, unknown> = {}) {
    const csrfResponse = await fetch(`${apiBase}/auth/csrf`, { credentials: "include" });
    if (!csrfResponse.ok) throw new Error("无法建立安全登录，请稍后再试");
    const csrf = (await csrfResponse.json()) as { csrfToken: string };
    await postJson("/auth/session", { idToken, csrfToken: csrf.csrfToken, ...extra });
    window.location.assign("/");
  }

  async function useCachedLogin(): Promise<boolean> {
    const auth = firebaseAuth();
    await auth.authStateReady();
    if (auth.currentUser?.phoneNumber !== `+1${phoneDigits}`) return false;
    const idToken = await auth.currentUser.getIdToken();
    try {
      await bootstrapSession(idToken);
    } catch (caught) {
      if (caught instanceof LoginApiError && caught.code === "PASSWORD_SETUP_REQUIRED") {
        setVerifiedIdToken(idToken);
        setAccount({ exists: true, hasPassword: false });
        setStep("setup-password");
        return true;
      }
      if (caught instanceof LoginApiError && caught.code === "REGISTRATION_REQUIRED") {
        setVerifiedIdToken(idToken);
        setAccount({ exists: false, hasPassword: false });
        setStep("register");
        return true;
      }
      throw caught;
    }
    return true;
  }

  async function sendCodeInternal() {
    const auth = firebaseAuth();
    verifierRef.current?.clear();
    verifierRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: developmentLoginEnabled ? "normal" : "invisible",
    });
    confirmationRef.current = await signInWithPhoneNumber(auth, `+1${phoneDigits}`, verifierRef.current);
    setStep("code");
    setCode("");
    setCountdown(60);
  }

  async function startLogin() {
    if (!validatePhone()) return;
    setBusy(true);
    setError("");
    try {
      if (await useCachedLogin()) return;
      const status = await postJson<AccountStatus>("/auth/account-status", { phoneE164: `+1${phoneDigits}` });
      setAccount(status);
      if (status.exists) setStep("password");
      else await sendCodeInternal();
    } catch (caught) {
      console.error("[login-start]", caught);
      setError(loginError(caught, "暂时无法登录，请稍后再试"));
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    if (!validatePhone()) return;
    setBusy(true);
    setError("");
    try {
      await sendCodeInternal();
    } catch (caught) {
      console.error("[firebase-phone-auth]", caught);
      setError(loginError(caught, "验证码发送失败，请稍后再试"));
    } finally {
      setBusy(false);
    }
  }

  async function passwordLogin() {
    if (password.length < 8 || password.length > 72) {
      setError("请输入 8 至 72 个字符的密码");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await postJson<{ customToken: string }>("/auth/password", {
        phoneE164: `+1${phoneDigits}`,
        password,
      });
      const credential = await signInWithCustomToken(firebaseAuth(), result.customToken);
      await bootstrapSession(await credential.user.getIdToken());
    } catch (caught) {
      console.error("[password-login]", caught);
      setError(loginError(caught, "密码登录失败，请重试"));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!/^\d{6}$/.test(code)) {
      setError("请输入短信中的 6 位验证码");
      return;
    }
    if (!confirmationRef.current) {
      setError("验证码已失效，请重新发送");
      setStep("phone");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const credential = await confirmationRef.current.confirm(code);
      const idToken = await credential.user.getIdToken();
      if (!account?.exists) {
        setVerifiedIdToken(idToken);
        setStep("register");
      } else if (!account.hasPassword) {
        setVerifiedIdToken(idToken);
        setStep("setup-password");
      } else {
        await bootstrapSession(idToken);
      }
    } catch (caught) {
      console.error("[firebase-phone-verify]", caught);
      setError(loginError(caught, "验证码验证失败，请重试"));
    } finally {
      setBusy(false);
    }
  }

  function validateNewPassword(): boolean {
    if (password.length < 8 || password.length > 72) {
      setError("密码必须为 8 至 72 个字符");
      return false;
    }
    if (password !== passwordAgain) {
      setError("两次输入的密码不一致");
      return false;
    }
    return true;
  }

  async function finishRegistration() {
    if (!firstName.trim() || !lastName.trim()) {
      setError("请填写完整姓名");
      return;
    }
    if (!validateNewPassword()) return;
    setBusy(true);
    setError("");
    try {
      await bootstrapSession(verifiedIdToken, {
        registration: { firstName: firstName.trim(), lastName: lastName.trim(), password },
      });
    } catch (caught) {
      setError(loginError(caught, "注册失败，请重试"));
    } finally {
      setBusy(false);
    }
  }

  async function finishPasswordSetup() {
    if (!validateNewPassword()) return;
    setBusy(true);
    setError("");
    try {
      await bootstrapSession(verifiedIdToken, { passwordSetup: { password } });
    } catch (caught) {
      setError(loginError(caught, "密码设置失败，请重试"));
    } finally {
      setBusy(false);
    }
  }

  async function developmentLogin() {
    if (!validatePhone()) return;
    setBusy(true);
    setError("");
    try {
      await postJson("/auth/dev-session", { phoneE164: `+1${phoneDigits}` });
      window.location.assign("/");
    } catch (caught) {
      setError(loginError(caught, "本地测试登录失败"));
    } finally {
      setBusy(false);
    }
  }

  function resetPhone() {
    setStep("phone");
    setAccount(null);
    setCode("");
    setPassword("");
    setPasswordAgain("");
    setVerifiedIdToken("");
    setError("");
  }

  const heading = {
    phone: ["登录", "输入手机号码"],
    password: ["密码登录", "输入密码"],
    code: ["验证身份", "输入短信验证码"],
    register: ["新用户注册", "填写姓名并设置密码"],
    "setup-password": ["账号升级", "设置登录密码"],
  }[step];

  return (
    <section className="login-card" aria-label="手机号登录">
      <div><p className="login-step">{heading[0]}</p><h2>{heading[1]}</h2></div>

      {step === "phone" && <>
        <label className="field-label" htmlFor="phone-number">美国手机号码</label>
        <div className="phone-field"><span aria-hidden="true">+1</span><input id="phone-number" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="(470) 123-4567" value={displayPhone(phoneDigits)} onChange={(event) => { setPhoneDigits(digitsOnly(event.target.value)); setError(""); }} disabled={busy} /></div>
        <button className="save-record" type="button" disabled={busy} onClick={startLogin}>{busy ? "正在登录…" : "登录"}</button>
        {developmentLoginEnabled && <div className="dev-login-box"><strong>本地开发模式</strong><span>不会发送短信，只用于这台电脑上的功能验证。</span><button type="button" disabled={busy} onClick={developmentLogin}>使用此号码直接进入</button></div>}
      </>}

      {step === "password" && <>
        <p className="code-sent">账号 <strong>+1 {displayPhone(phoneDigits)}</strong></p>
        <label className="field-label" htmlFor="login-password">密码<input id="login-password" type="password" autoComplete="current-password" minLength={8} maxLength={72} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} disabled={busy || account?.hasPassword === false} /></label>
        {account?.hasPassword === false && <p className="login-notice">这个老账号还没有密码，请先使用验证码验证身份并设置密码。</p>}
        <button className="save-record" type="button" disabled={busy || account?.hasPassword === false} onClick={passwordLogin}>{busy ? "正在登录…" : "密码登录"}</button>
        <div className="login-secondary-actions"><button type="button" onClick={resetPhone}>修改号码</button><button type="button" disabled={busy} onClick={sendCode}>使用验证码登录</button></div>
      </>}

      {step === "code" && <>
        <p className="code-sent">验证码已发送到 <strong>+1 {displayPhone(phoneDigits)}</strong></p>
        <label className="field-label" htmlFor="verification-code">6 位验证码</label>
        <input className="code-input" id="verification-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} disabled={busy} />
        <button className="save-record" type="button" disabled={busy} onClick={verifyCode}>{busy ? "正在验证…" : "确认验证码"}</button>
        <div className="login-secondary-actions"><button type="button" onClick={resetPhone}>修改号码</button><button type="button" disabled={countdown > 0 || busy} onClick={sendCode}>{countdown > 0 ? `${countdown} 秒后可重发` : "重新发送"}</button></div>
      </>}

      {(step === "register" || step === "setup-password") && <>
        {step === "register" ? <div className="editor-grid login-name-grid"><label className="field-label">名<input autoComplete="given-name" required maxLength={50} value={firstName} onChange={(event) => { setFirstName(event.target.value); setError(""); }} /></label><label className="field-label">姓<input autoComplete="family-name" required maxLength={50} value={lastName} onChange={(event) => { setLastName(event.target.value); setError(""); }} /></label></div> : <p className="login-notice">验证码已通过。设置密码后，以后可以直接用密码登录。</p>}
        <label className="field-label">设置密码<input type="password" autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} /><small>8 至 72 个字符</small></label>
        <label className="field-label">再次输入密码<input type="password" autoComplete="new-password" minLength={8} maxLength={72} value={passwordAgain} onChange={(event) => { setPasswordAgain(event.target.value); setError(""); }} /></label>
        <button className="save-record" type="button" disabled={busy} onClick={step === "register" ? finishRegistration : finishPasswordSetup}>{busy ? "正在保存…" : step === "register" ? "完成注册并登录" : "保存密码并登录"}</button>
      </>}

      {error && <p className="form-error" role="alert">{error}</p>}
      <div id="recaptcha-container" />
      <p className="login-legal">验证码仅用于注册、找回登录或更换设备；运营商可能收取短信费用。</p>
    </section>
  );
}
