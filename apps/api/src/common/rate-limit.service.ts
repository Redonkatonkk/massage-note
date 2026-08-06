import { createHash } from "node:crypto";
import { HttpException, HttpStatus, Injectable, OnModuleDestroy } from "@nestjs/common";
import type { Request } from "express";
import { Redis } from "ioredis";

type LimitRule = { name: string; maximum: number; windowSeconds: number };

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly redis?: Redis;
  private readonly fallback = new Map<string, { count: number; expiresAt: number }>();
  private connecting: Promise<void> | undefined;

  constructor() {
    const url = process.env.REDIS_URL?.trim();
    if (url) {
      this.redis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1, connectTimeout: 2_000 });
      this.redis.on("error", () => undefined);
    }
  }

  async check(request: Request) {
    const rule = this.ruleFor(request);
    if (!rule) return;
    const identity = createHash("sha256").update(request.ip || request.socket.remoteAddress || "unknown").digest("hex").slice(0, 24);
    const window = Math.floor(Date.now() / (rule.windowSeconds * 1_000));
    const key = `massage-note:rate:${rule.name}:${identity}:${window}`;
    let count: number;
    try {
      if (!this.redis) throw new Error("redis disabled");
      if (this.redis.status === "wait") this.connecting ??= this.redis.connect().then(() => undefined).finally(() => { this.connecting = undefined; });
      if (this.connecting) await this.connecting;
      count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, rule.windowSeconds + 2);
    } catch {
      const current = this.fallback.get(key);
      if (!current || current.expiresAt <= Date.now()) {
        count = 1;
        this.fallback.set(key, { count, expiresAt: Date.now() + rule.windowSeconds * 1_000 });
      } else {
        count = current.count + 1;
        current.count = count;
      }
      if (this.fallback.size > 10_000) {
        for (const [candidate, value] of this.fallback) if (value.expiresAt <= Date.now()) this.fallback.delete(candidate);
      }
    }
    if (count > rule.maximum) {
      throw new HttpException({ code: "RATE_LIMITED", messageZh: "操作过于频繁，请稍后再试" }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async onModuleDestroy() {
    if (this.redis && this.redis.status !== "end") this.redis.disconnect();
  }

  private ruleFor(request: Request): LimitRule | null {
    const path = request.path;
    if (request.method === "POST" && (path.endsWith("/auth/session") || path.endsWith("/auth/dev-session") || path.endsWith("/auth/password"))) return { name: "login", maximum: 10, windowSeconds: 600 };
    if (request.method === "POST" && path.endsWith("/auth/account-status")) return { name: "account-status", maximum: 30, windowSeconds: 600 };
    if (path.includes("/ai/")) return { name: "ai", maximum: 20, windowSeconds: 60 };
    if (path.endsWith("/finance/export.csv")) return { name: "export", maximum: 10, windowSeconds: 60 };
    if (path.endsWith("/join-requests") && request.method === "POST") return { name: "join", maximum: 10, windowSeconds: 3_600 };
    if (path.endsWith("/events")) return { name: "events", maximum: 60, windowSeconds: 60 };
    if (["POST", "PATCH", "DELETE", "PUT"].includes(request.method)) return { name: "mutation", maximum: 120, windowSeconds: 60 };
    return null;
  }
}
