import "reflect-metadata";
import { HttpException, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { expect, it } from "vitest";
import { ApiExceptionFilter } from "../src/common/api-exception.filter.js";

@Module({})
class TestModule {}

it("原生中间件异步限流错误仍返回统一 JSON 429", async () => {
  const app = await NestFactory.create(TestModule, { logger: false });
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.locals.requestId = "http-rate-test";
    void Promise.reject(new HttpException({ code: "RATE_LIMITED", messageZh: "操作过于频繁" }, 429)).catch(next);
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  try {
    await app.listen(0, "127.0.0.1");
    const response = await fetch(await app.getUrl());
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: "RATE_LIMITED", requestId: "http-rate-test" });
  } finally { await app.close(); }
});
