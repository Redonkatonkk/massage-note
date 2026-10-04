import { apiRequest } from "./api";
import { displayUsPhone, effectiveClosingDeliveryPhone, usPhoneToE164, validateClosingDeliveryPhone } from "./member-closing-delivery";
import type { StoreMember, StoreRole } from "./types";

export type MemberFilter = "ACTIVE" | "UNCLAIMED" | "INACTIVE" | "ALL";
export type MemberRoleFilter = "ALL" | StoreRole;
export type EmploymentType = "FULL_TIME" | "PART_TIME";

export interface MemberDraft {
  displayName: string;
  role: StoreRole;
  isServiceProvider: boolean;
  employmentType: EmploymentType | "";
  commissionPercent: string;
  dailySettlementEnabled: boolean;
  closingDeliveryEnabled: boolean;
  closingDeliveryPhone: string;
  closingImageLocale: "zh_CN" | "en_US" | "";
}

export function filterMembers(members: StoreMember[], query: string, filter: MemberFilter, role: MemberRoleFilter): StoreMember[] {
  const search = query.trim().toLocaleLowerCase();
  const phoneSearch = search.replace(/[\s()+.-]/g, "");
  return members.filter((member) => {
    const active = member.status === "ACTIVE";
    if (filter === "ACTIVE" && !active || filter === "INACTIVE" && active || filter === "UNCLAIMED" && (!active || member.user)) return false;
    if (role !== "ALL" && role !== member.role) return false;
    if (!search) return true;
    const names = [member.displayName, member.user?.firstName, member.user?.lastName].filter(Boolean).join(" ").toLocaleLowerCase();
    const phones = [member.closingDeliveryPhoneE164, member.user?.phoneE164].filter(Boolean).join(" ");
    return names.includes(search) || (/^\d+$/.test(phoneSearch) && phones.includes(phoneSearch));
  }).sort((left, right) => Number(right.role === "OWNER") - Number(left.role === "OWNER")
    || left.displayName.localeCompare(right.displayName, "zh-CN", { numeric: true }) || left.id.localeCompare(right.id));
}

export function memberDraft(member: StoreMember): MemberDraft {
  return {
    displayName: member.displayName,
    role: member.role,
    isServiceProvider: member.isServiceProvider,
    employmentType: member.employmentType ?? "",
    commissionPercent: member.defaultCommissionBps === null ? "" : String(member.defaultCommissionBps / 100),
    dailySettlementEnabled: member.dailySettlementEnabled ?? false,
    closingDeliveryEnabled: member.closingDeliveryEnabled,
    closingDeliveryPhone: displayUsPhone(effectiveClosingDeliveryPhone(member.closingDeliveryPhoneE164, member.user?.phoneE164)),
    closingImageLocale: member.closingImageLocale ?? "",
  };
}

export function isMemberDraftDirty(member: StoreMember, draft: MemberDraft): boolean {
  const initial = memberDraft(member);
  return (Object.keys(initial) as Array<keyof MemberDraft>).some((key) => draft[key] !== initial[key]);
}

export function parseCommissionPercent(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (!/^\d+(?:\.\d{0,2})?$/.test(text) || Number(text) > 100) throw new Error("提成比例必须是 0 到 100 之间的数字，最多两位小数。");
  return Math.round(Number(text) * 100);
}

// Validate the entire draft before either write. Metadata and commission use separate versioned endpoints.
export async function saveMemberSettings(storeId: string, member: StoreMember, draft: MemberDraft, dailyRankingEnabled: boolean, onProgress: (member: StoreMember) => void) {
  const displayName = draft.displayName.trim();
  if (!displayName || displayName.length > 80) throw new Error("请填写不超过 80 个字符的员工名字。");
  if (member.role === "OWNER" && (draft.role !== "OWNER" || draft.isServiceProvider !== member.isServiceProvider)
    || member.role !== "OWNER" && draft.role === "OWNER") throw new Error("店主身份只能通过店主转移流程修改");
  if (dailyRankingEnabled && draft.isServiceProvider && !draft.employmentType) throw new Error("参与记工的成员必须设置全职或兼职。");
  validateClosingDeliveryPhone(draft.closingDeliveryEnabled, draft.closingDeliveryPhone, member.user?.phoneE164);
  const commissionBps = parseCommissionPercent(draft.commissionPercent);
  const initial = memberDraft(member);
  const phoneChanged = displayUsPhone(draft.closingDeliveryPhone) !== initial.closingDeliveryPhone;
  const phone = phoneChanged ? draft.closingDeliveryPhone.trim() ? usPhoneToE164(draft.closingDeliveryPhone) : null : member.closingDeliveryPhoneE164;
  const metadataChanged = displayName !== member.displayName || draft.role !== member.role || draft.isServiceProvider !== member.isServiceProvider
    || draft.employmentType !== initial.employmentType || draft.dailySettlementEnabled !== initial.dailySettlementEnabled
    || draft.closingDeliveryEnabled !== member.closingDeliveryEnabled || phone !== member.closingDeliveryPhoneE164 || draft.closingImageLocale !== initial.closingImageLocale;
  let updated = member;
  if (metadataChanged) {
    const result = await apiRequest<StoreMember>(`/stores/${storeId}/members/${member.id}`, { method: "PATCH", body: {
      version: updated.version, displayName,
      ...(member.role === "OWNER" ? {} : { role: draft.role, isServiceProvider: draft.isServiceProvider }),
      employmentType: draft.employmentType || null, dailySettlementEnabled: draft.dailySettlementEnabled,
      closingDeliveryEnabled: draft.closingDeliveryEnabled, closingDeliveryPhoneE164: phone, closingImageLocale: draft.closingImageLocale || null,
    } });
    updated = { ...updated, ...result };
    onProgress(updated);
  }
  let refreshedToday = false;
  if (commissionBps !== member.defaultCommissionBps) {
    const result = await apiRequest<{ membership: StoreMember; refreshedCurrentDayRecordCount: number }>(`/stores/${storeId}/members/${member.id}/commissions/default`, {
      method: "PUT", idempotent: true, body: { version: updated.version, commissionBps },
    });
    updated = { ...updated, ...result.membership };
    onProgress(updated);
    refreshedToday = result.refreshedCurrentDayRecordCount > 0;
  }
  return { member: updated, refreshedToday };
}
