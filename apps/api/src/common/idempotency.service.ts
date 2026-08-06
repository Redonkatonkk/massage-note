import { createHash } from "node:crypto";
import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@massage-note/database";
import { PrismaService } from "../database/prisma.service.js";
import { toJsonSafe } from "./json-safe.interceptor.js";

interface IdempotencyOptions {
  storeId: string;
  userId: string;
  key: string;
  route: string;
  payload: unknown;
  responseCode: number;
}

function canonicalValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

export function idempotencyRequestHash(payload: unknown): string {
  const encoded = JSON.stringify(canonicalValue(payload)) ?? "null";
  return createHash("sha256")
    .update(encoded)
    .digest("hex");
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(
    options: IdempotencyOptions,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const requestHash = idempotencyRequestHash(options.payload);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.idempotencyRequest.findUnique({
          where: {
            storeId_userId_key_route: {
              storeId: options.storeId,
              userId: options.userId,
              key: options.key,
              route: options.route,
            },
          },
        });
        if (existing) return this.resolveExisting<T>(existing, requestHash);

        const request = await transaction.idempotencyRequest.create({
          data: {
            storeId: options.storeId,
            userId: options.userId,
            key: options.key,
            route: options.route,
            requestHash,
            status: "IN_PROGRESS",
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
          },
        });
        const result = await operation(transaction);
        const responseJson = toJsonSafe(result) as Prisma.InputJsonValue;
        await transaction.idempotencyRequest.update({
          where: { id: request.id },
          data: {
            status: "COMPLETED",
            responseCode: options.responseCode,
            responseJson,
          },
        });
        return result;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await this.prisma.idempotencyRequest.findUnique({
          where: {
            storeId_userId_key_route: {
              storeId: options.storeId,
              userId: options.userId,
              key: options.key,
              route: options.route,
            },
          },
        });
        if (existing) return this.resolveExisting<T>(existing, requestHash);
      }
      throw error;
    }
  }

  private resolveExisting<T>(
    existing: {
      requestHash: string;
      status: string;
      responseJson: Prisma.JsonValue | null;
      expiresAt: Date;
    },
    requestHash: string,
  ): T {
    if (existing.requestHash !== requestHash) {
      throw new ConflictException({
        code: "IDEMPOTENCY_KEY_REUSED",
        messageZh: "同一个幂等编号不能用于不同的请求内容",
      });
    }
    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException({
        code: "IDEMPOTENCY_KEY_EXPIRED",
        messageZh: "该幂等编号已过期，请生成新编号后重试",
      });
    }
    if (existing.status === "COMPLETED" && existing.responseJson !== null) {
      return existing.responseJson as T;
    }
    throw new ConflictException({
      code: "IDEMPOTENCY_REQUEST_IN_PROGRESS",
      messageZh: "相同操作正在处理中，请稍后重试",
    });
  }
}
