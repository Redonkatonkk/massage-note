import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { BrandMark, UiIcon } from "../ui/primitives";

export const metadata: Metadata = {
  title: "登录 · Massage note",
};

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-intro" aria-labelledby="login-title">
        <div className="login-brand"><BrandMark /><span>massage note.</span></div>
        <p className="eyebrow login-kicker">把日常，打理得更从容。</p>
        <h1 id="login-title">一天的账，清清楚楚。</h1>
        <p>
          用手机快速记工、补充付款和小费。历史价格与提成会保留当时快照，不会因为后来修改设置而变化。
        </p>
        <div className="login-workflow" aria-label="从记工到日结">
          <div><UiIcon name="log" /><strong>快速记工</strong><span>服务与小费</span></div>
          <UiIcon name="arrow" />
          <div><UiIcon name="wallet" /><strong>清晰收款</strong><span>现金与刷卡</span></div>
          <UiIcon name="arrow" />
          <div><UiIcon name="check" /><strong>轻松日结</strong><span>工资与结算</span></div>
        </div>
        <p className="login-device-note"><UiIcon name="check" />手机、iPad、电脑实时同步</p>
      </section>

      <LoginForm />
    </main>
  );
}
