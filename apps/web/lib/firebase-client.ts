import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

export function firebaseAuth(): Auth {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) {
    throw new Error("手机登录尚未配置，请联系系统管理员");
  }

  const config = { apiKey, authDomain, projectId, appId };
  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  auth.languageCode = "zh-CN";
  return auth;
}
