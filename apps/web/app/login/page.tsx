import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { BrandMark, UiIcon } from "../ui/primitives";
import { appHref, isPortfolioDemo } from "../../lib/demo-mode";

export const metadata: Metadata = {
  title: "登录 · Massage note",
};

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-intro" aria-labelledby="login-title">
        <div className="login-brand"><BrandMark /><span>massage note.</span></div>
        <p className="eyebrow login-kicker">门店记工与财务</p>
        <h1 id="login-title"><span>每一笔服务，</span><span>每一天的账。</span></h1>
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

      {isPortfolioDemo ? <section className="setup-card"><p className="eyebrow">Portfolio demo / 作品演示</p><h2>No sign-in required / 无需登录</h2><p>This public demo uses synthetic data. Authentication is disabled. / 公开演示使用虚构数据，登录功能已禁用。</p><a className="primary-action" href={appHref("/")}>Explore demo / 进入演示</a></section> : <LoginForm />}
    </main>
  );
}
