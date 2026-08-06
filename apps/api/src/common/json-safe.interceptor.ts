import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { map, type Observable } from "rxjs";

export function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new RangeError("金额超出 JSON 安全整数范围");
    }
    return Number(value);
  }
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value instanceof Date) return value.toISOString();
  if (value === null || typeof value !== "object") {
    return value;
  }
  if ("toJSON" in value && typeof value.toJSON === "function") {
    return toJsonSafe(value.toJSON());
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, toJsonSafe(entry)]),
  );
}

@Injectable()
export class JsonSafeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(toJsonSafe));
  }
}
