import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import { json, urlencoded, type ErrorRequestHandler, type RequestHandler } from "express";

const ordinaryJson = json({ limit: "100kb" });
const importJson = json({ limit: "51mb" });
export const jsonRequestBody: RequestHandler = (request, response, next) => {
  const largeImport = request.method === "POST" && /^\/api\/v1\/stores\/[0-9a-f-]+\/data\/import\/(preview|confirm)$/i.test(request.path);
  (largeImport ? importJson : ordinaryJson)(request, response, next);
};
export const urlencodedRequestBody = urlencoded({ extended: true, limit: "100kb" });
export const requestBodyError: ErrorRequestHandler = (error: unknown, _request, _response, next) => {
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  if (status === 413) return next(new PayloadTooLargeException({ code: "REQUEST_BODY_TOO_LARGE", messageZh: "请求文件过大，导入文件不能超过 50 MiB" }));
  if (status === 400) return next(new BadRequestException({ code: "INVALID_JSON_BODY", messageZh: "请求内容格式不正确，请检查 JSON 文件" }));
  next(error);
};
