import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Massage note",
    short_name: "Massage note",
    description: "按摩店记工与财务管理系统",
    start_url: "/",
    display: "standalone",
    background_color: "#fffaf3",
    theme_color: "#fffaf3",
    lang: "zh-CN",
    scope: "/",
    orientation: "any",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
