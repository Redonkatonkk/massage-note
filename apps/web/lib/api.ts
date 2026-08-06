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
    super(body?.messageZh ?? body?.message ?? "请求失败，请稍后重试");
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code ?? "REQUEST_FAILED";
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
  return payload as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}
