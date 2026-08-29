import "./load-env.js";
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module.js";
import { ApiExceptionFilter } from "./common/api-exception.filter.js";
import { RateLimitService } from "./common/rate-limit.service.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: false,
  });
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  app.getHttpAdapter().getInstance().disable("x-powered-by");
  if (process.env.NODE_ENV === "production") app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.use((request: Request, response: Response, next: NextFunction) => {
    const supplied = request.header("x-request-id");
    const requestId =
      supplied && /^[A-Za-z0-9._:-]{8,128}$/.test(supplied)
        ? supplied
        : randomUUID();
    response.locals.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), geolocation=(), payment=(), usb=()");
    response.setHeader("Cache-Control", request.path.includes("/health") ? "no-cache" : "no-store");
    if (process.env.NODE_ENV === "production") response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  });

  const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (!unsafeMethods.has(request.method)) return next();
    const isSessionBootstrap = request.path === "/api/v1/auth/session" || request.path === "/api/v1/auth/dev-session";
    const isClosingDeliveryAgent = (request.path.startsWith("/api/v1/closing-delivery-agent/") || request.path.startsWith("/api/v1/employee-settlement-delivery-agent/")) && request.header("authorization")?.startsWith("Bearer mna_");
    const origin = request.header("origin");
    if (!isSessionBootstrap && !isClosingDeliveryAgent && origin !== webOrigin) {
      return response.status(403).json({ code: "CSRF_ORIGIN_REJECTED", messageZh: "请求来源不受信任，请刷新页面后重试", requestId: response.locals.requestId });
    }
    next();
  });

  const rateLimit = app.get(RateLimitService);
  app.use((request: Request, _response: Response, next: NextFunction) => {
    void rateLimit.check(request).then(() => next()).catch(next);
  });

  app.enableCors({
    origin: [webOrigin],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-CSRF-Token",
      "X-Request-Id",
    ],
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
