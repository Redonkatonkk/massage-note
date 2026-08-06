import { z } from "zod";

const personNameSchema = z.string().trim().min(1, "姓名不能为空").max(50);

export const updateProfileSchema = z.object({
  firstName: personNameSchema,
  lastName: personNameSchema,
});

export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

const passwordSchema = z.string().min(8, "密码至少需要 8 个字符").max(72, "密码最多 72 个字符");

export const updatePasswordSchema = z.object({
  currentPassword: passwordSchema.optional(),
  newPassword: passwordSchema,
}).refine(
  (input) => !input.currentPassword || input.currentPassword !== input.newPassword,
  { path: ["newPassword"], message: "新密码不能与当前密码相同" },
);

export type UpdatePasswordInput = z.input<typeof updatePasswordSchema>;
