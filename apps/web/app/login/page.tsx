import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "登录 · Massage note",
};

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-intro" aria-labelledby="login-title">
        <p className="eyebrow">Massage note</p>
        <h1 id="login-title">一天的账，清清楚楚。</h1>
        <p>
          用手机快速记工、补充付款和小费。历史价格与提成会保留当时快照，不会因为后来修改设置而变化。
        </p>
        <ul>
          <li>手机、iPad、电脑实时同步</li>
          <li>现金与刷卡分开记录</li>
          <li>工资和老板尚欠自动计算</li>
        </ul>
      </section>

      <LoginForm />
    </main>
  );
}

