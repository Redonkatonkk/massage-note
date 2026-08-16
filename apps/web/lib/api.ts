import {
  isAppLocale,
  registerCatalogNamesFromPayload,
  translateApiError,
  translateText,
} from "./i18n";

export const apiBase =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly latestResource?: unknown;

  constructor(status: number, payload: unknown) {
    const body = payload as
      | { messageZh?: string; message?: string; code?: string; latestResource?: unknown }
      | null;
    const code = body?.code ?? "REQUEST_FAILED";
    const message = body?.messageZh ?? body?.message ?? "请求失败，请稍后重试";
    const locale = typeof document !== "undefined" && isAppLocale(document.documentElement.lang)
      ? document.documentElement.lang
      : "zh-CN";
    super(translateApiError(code, message, locale));
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.latestResource = body?.latestResource;
  }
}

interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  idempotent?: boolean;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { body, idempotent, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (typeof document !== "undefined" && isAppLocale(document.documentElement.lang)) {
    headers.set("Accept-Language", document.documentElement.lang);
  }
  if (idempotent) headers.set("Idempotency-Key", crypto.randomUUID());
  const response = await fetch(`${apiBase}${path}`, {
    ...requestOptions,
    headers,
    credentials: "include",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = response.status === 204
    ? null
    : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, payload);
  registerCatalogNamesFromPayload(payload, path);
  return payload as T;
}

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "操作失败，请稍后重试";
  const locale = typeof document !== "undefined" && isAppLocale(document.documentElement.lang)
    ? document.documentElement.lang
    : "zh-CN";
  return translateText(message, locale);
}
