export const isPortfolioDemo = process.env.NEXT_PUBLIC_PORTFOLIO_DEMO === "true";
export const appBasePath = process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "";

/** Raw anchors and location navigation need the same prefix as Next's assets. */
export function appHref(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const match = /^([^?#]*)(.*)$/.exec(path)!;
  const pathname = match[1]!;
  return `${appBasePath}${isPortfolioDemo && !pathname.endsWith("/") ? `${pathname}/` : pathname}${match[2]}`;
}
