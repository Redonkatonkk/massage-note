import { BadRequestException } from "@nestjs/common";
import { type ZodType } from "zod";

export function parseRequest<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const field = issue.path.length > 0 ? issue.path.join(".") : "_form";
    (fieldErrors[field] ??= []).push(issue.message);
  }

  throw new BadRequestException({
    code: "VALIDATION_FAILED",
    messageZh: "请检查填写内容后重试",
    fieldErrors,
  });
}
