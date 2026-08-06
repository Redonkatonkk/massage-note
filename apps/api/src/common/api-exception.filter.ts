import { randomUUID } from "node:crypto";
import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";

interface ErrorPayload {
  code: string;
  messageZh: string;
  requestId: string;
  fieldErrors?: Record<string, string[]>;
  latestResource?: unknown;
}

function defaultMessage(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "请求内容不正确，请检查后重试";
    case HttpStatus.UNAUTHORIZED:
      return "请先登录后再继续";
    case HttpStatus.FORBIDDEN:
      return "你没有执行此操作的权限";
    case HttpStatus.NOT_FOUND:
      return "没有找到请求的内容";
    case HttpStatus.CONFLICT:
      return "数据已发生变化，请刷新后重试";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "操作过于频繁，请稍后再试";
    case HttpStatus.SERVICE_UNAVAILABLE:
      return "服务暂时不可用，请稍后再试";
    default:
      return "系统暂时出现问题，请稍后再试";
  }
}

export function apiErrorFromException(
  exception: unknown,
  requestId: string,
): { status: number; payload: ErrorPayload } {
  const status =
    exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  const response = exception instanceof HttpException ? exception.getResponse() : null;
  const details =
    response !== null && typeof response === "object"
      ? (response as Record<string, unknown>)
      : null;

  const payload: ErrorPayload = {
    code:
      typeof details?.code === "string"
        ? details.code
        : `HTTP_${status.toString()}`,
    messageZh:
      typeof details?.messageZh === "string"
        ? details.messageZh
        : defaultMessage(status),
    requestId,
  };

  if (details?.fieldErrors && typeof details.fieldErrors === "object") {
    payload.fieldErrors = details.fieldErrors as Record<string, string[]>;
  }
  if (details && "latestResource" in details) {
    payload.latestResource = details.latestResource;
  }

  return { status, payload };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId =
      typeof response.locals.requestId === "string"
        ? response.locals.requestId
        : randomUUID();
    const error = apiErrorFromException(exception, requestId);

    if (!(exception instanceof HttpException)) {
      this.logger.error(`未处理异常，请求编号 ${requestId}`, exception);
    }
    response.status(error.status).json(error.payload);
  }
}
