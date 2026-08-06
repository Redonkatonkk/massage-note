export function parseCookieHeader(header: string | undefined): Map<string, string> {
  const result = new Map<string, string>();
  if (!header) return result;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key) continue;

    try {
      result.set(key, decodeURIComponent(value));
    } catch {
      // 忽略损坏的 Cookie，避免无关客户端数据把认证接口变成 500。
    }
  }
  return result;
}
