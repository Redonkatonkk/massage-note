import { z } from "zod";
import {
  commissionBpsSchema,
  uuidSchema,
  versionSchema,
} from "./common.js";

export const setEmployeeDefaultCommissionSchema = z.object({
  version: versionSchema,
  commissionBps: commissionBpsSchema.nullable(),
});

export const setEmployeeItemCommissionSchema = z.object({
  version: versionSchema,
  itemType: z.enum(["SERVICE", "ADDON"]),
  itemId: uuidSchema,
  commissionBps: commissionBpsSchema.nullable(),
});

export type SetEmployeeDefaultCommissionInput = z.input<
  typeof setEmployeeDefaultCommissionSchema
>;
export type SetEmployeeItemCommissionInput = z.input<
  typeof setEmployeeItemCommissionSchema
>;
