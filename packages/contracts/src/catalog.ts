import { z } from "zod";
import { commissionBpsSchema, moneyCentsSchema } from "./common.js";
import { versionSchema } from "./common.js";

export const catalogListQuerySchema = z.object({
  includeDeleted: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

const catalogNameSchema = z.string().trim().min(1, "项目名称不能为空").max(120);
const catalogShortNameSchema = z
  .string()
  .trim()
  .min(1, "项目简称不能为空")
  .max(30);

export const catalogServicePriceOptionSchema = z.object({
  durationMinutes: z.number().int().min(1).max(720),
  priceCents: moneyCentsSchema,
});

const catalogServicePriceOptionsSchema = z
  .array(catalogServicePriceOptionSchema)
  .min(1, "每个主要项目至少需要一个时长价格")
  .max(20)
  .superRefine((options, context) => {
    const seen = new Set<number>();
    options.forEach((option, index) => {
      if (seen.has(option.durationMinutes)) {
        context.addIssue({
          code: "custom",
          path: [index, "durationMinutes"],
          message: "同一项目不能重复设置相同时长",
        });
      }
      seen.add(option.durationMinutes);
    });
  });

export const catalogServiceItemSchema = z.object({
  fullName: catalogNameSchema,
  shortName: catalogShortNameSchema,
  priceOptions: catalogServicePriceOptionsSchema,
  defaultCommissionBps: commissionBpsSchema.nullable().optional(),
});

export const catalogAddonItemSchema = z.object({
  name: catalogNameSchema,
  shortName: catalogShortNameSchema,
  amountCents: moneyCentsSchema,
  durationMinutes: z.number().int().min(0).max(720).nullable().optional(),
  defaultCommissionBps: commissionBpsSchema.nullable().optional(),
});

export const catalogDiscountItemSchema = z.object({
  name: catalogNameSchema,
  shortName: catalogShortNameSchema,
  amountCents: moneyCentsSchema,
});

export const initializeCatalogSchema = z.object({
  serviceItems: z
    .array(catalogServiceItemSchema)
    .min(1, "至少设置一个主要项目")
    .max(100),
  addonItems: z.array(catalogAddonItemSchema).max(100).default([]),
  discountItems: z.array(catalogDiscountItemSchema).max(100).default([]),
});

const positionSchema = z.number().int().min(0).max(100_000);

export const createCatalogItemSchema = z.discriminatedUnion("type", [
  catalogServiceItemSchema.extend({
    type: z.literal("SERVICE"),
    position: positionSchema.optional(),
  }),
  catalogAddonItemSchema.extend({
    type: z.literal("ADDON"),
    position: positionSchema.optional(),
  }),
  catalogDiscountItemSchema.extend({
    type: z.literal("DISCOUNT"),
    position: positionSchema.optional(),
  }),
]);

const updateBase = {
  version: versionSchema,
  position: positionSchema.optional(),
  isEnabled: z.boolean().optional(),
};

export const updateCatalogItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("SERVICE"),
    ...updateBase,
    fullName: catalogNameSchema.optional(),
    shortName: catalogShortNameSchema.optional(),
    priceOptions: catalogServicePriceOptionsSchema.optional(),
    defaultCommissionBps: commissionBpsSchema.nullable().optional(),
  }),
  z.object({
    type: z.literal("ADDON"),
    ...updateBase,
    name: catalogNameSchema.optional(),
    shortName: catalogShortNameSchema.optional(),
    amountCents: moneyCentsSchema.optional(),
    durationMinutes: z.number().int().min(0).max(720).nullable().optional(),
    defaultCommissionBps: commissionBpsSchema.nullable().optional(),
  }),
  z.object({
    type: z.literal("DISCOUNT"),
    ...updateBase,
    name: catalogNameSchema.optional(),
    shortName: catalogShortNameSchema.optional(),
    amountCents: moneyCentsSchema.optional(),
  }),
]).refine(
  (value) =>
    Object.keys(value).some((key) => key !== "type" && key !== "version"),
  "至少需要修改一个项目字段",
);

export const deleteCatalogItemSchema = z.object({
  type: z.enum(["SERVICE", "ADDON", "DISCOUNT"]),
  version: versionSchema,
  reason: z.string().trim().min(1, "请填写删除项目的原因").max(500),
});

export const restoreCatalogItemSchema = z.object({
  type: z.enum(["SERVICE", "ADDON", "DISCOUNT"]),
  version: versionSchema,
});

export const reorderCatalogItemsSchema = z.object({
  type: z.enum(["SERVICE", "ADDON", "DISCOUNT"]),
  items: z
    .array(z.object({ id: z.string().uuid(), version: versionSchema }))
    .min(1, "排序列表不能为空")
    .max(100)
    .superRefine((items, context) => {
      const seen = new Set<string>();
      items.forEach((item, index) => {
        if (seen.has(item.id)) {
          context.addIssue({
            code: "custom",
            path: [index, "id"],
            message: "排序列表不能包含重复项目",
          });
        }
        seen.add(item.id);
      });
    }),
});

export type InitializeCatalogInput = z.input<typeof initializeCatalogSchema>;
export type InitializeCatalog = z.output<typeof initializeCatalogSchema>;
export type CreateCatalogItemInput = z.input<typeof createCatalogItemSchema>;
export type UpdateCatalogItemInput = z.input<typeof updateCatalogItemSchema>;
export type DeleteCatalogItemInput = z.input<typeof deleteCatalogItemSchema>;
export type RestoreCatalogItemInput = z.input<typeof restoreCatalogItemSchema>;
export type ReorderCatalogItemsInput = z.input<typeof reorderCatalogItemsSchema>;
export type CatalogListQuery = z.output<typeof catalogListQuerySchema>;
