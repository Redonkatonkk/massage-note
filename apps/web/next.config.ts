import type { NextConfig } from "next";
import { loadEnvFile } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

try {
  loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "../../.env"));
} catch (error) {
  if (
    !(error instanceof Error) ||
    !("code" in error) ||
    error.code !== "ENOENT"
  ) {
    throw error;
  }
}

const staticExportEnabled = process.env.WEB_STATIC_EXPORT === "true";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: staticExportEnabled ? "export" : "standalone",
  trailingSlash: staticExportEnabled,
  outputFileTracingRoot: resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  transpilePackages: ["@massage-note/contracts"],
  async rewrites() {
    const apiProxyTarget = process.env.API_PROXY_TARGET;
    if (!apiProxyTarget || staticExportEnabled) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
  async headers() {
    if (staticExportEnabled) {
      return [];
    }

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";
    const apiOrigin = /^https?:\/\//.test(apiBaseUrl) ? new URL(apiBaseUrl).origin : "";
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)" },
      { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com https://www.google.com/recaptcha/; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ""} https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com; frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/; media-src 'self' blob:; worker-src 'self' blob:` },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ];
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
