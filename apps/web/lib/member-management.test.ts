import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./api";
import { filterMembers, isMemberDraftDirty, memberDraft, parseCommissionPercent, saveMemberSettings } from "./member-management";
import type { StoreMember } from "./types";

vi.mock("./api", () => ({ apiRequest: vi.fn() }));
const request = vi.mocked(apiRequest);
const employee: StoreMember = {
  id: "amy", displayName: "Amy", role: "EMPLOYEE", status: "ACTIVE", version: 7,
  isServiceProvider: true, employmentType: "PART_TIME", defaultCommissionBps: 6000,
  dailySettlementEnabled: false, closingDeliveryEnabled: true, closingDeliveryPhoneE164: null,
  closingImageLocale: null, deletedAt: null,
  user: { id: "account", firstName: "Amy", lastName: "Chen", phoneE164: "+17705750450" },
};
beforeEach(() => request.mockReset());

describe("member directory", () => {
  const members = [employee, { ...employee, id: "unclaimed", displayName: "小美", user: null },
    { ...employee, id: "inactive", status: "INACTIVE", deletedAt: "2026-10-01" },
    { ...employee, id: "owner", displayName: "Zoe", role: "OWNER" as const }];
  it("keeps active, unclaimed and inactive lists distinct with owner first", () => {
    const active = filterMembers(members, "", "ACTIVE", "ALL");
    expect(active[0]?.id).toBe("owner");
    expect(active.map((member) => member.id).sort()).toEqual(["amy", "owner", "unclaimed"]);
    expect(filterMembers(members, "", "UNCLAIMED", "ALL").map((member) => member.id)).toEqual(["unclaimed"]);
    expect(filterMembers(members, "", "INACTIVE", "ALL").map((member) => member.id)).toEqual(["inactive"]);
    expect(filterMembers(members, "", "ALL", "OWNER").map((member) => member.id)).toEqual(["owner"]);
    expect(members[0]).toBe(employee);
  });
  it("combines role/status with name and formatted phone search", () => {
    expect(filterMembers(members, " chen ", "ACTIVE", "EMPLOYEE").map((member) => member.id)).toEqual(["amy"]);
    expect(filterMembers(members, "(770) 575-0450", "ACTIVE", "EMPLOYEE").map((member) => member.id)).toEqual(["amy"]);
    expect(filterMembers(members, "小美", "ACTIVE", "EMPLOYEE").map((member) => member.id)).toEqual(["unclaimed"]);
    expect(filterMembers(members, "Chen", "UNCLAIMED", "ALL")).toEqual([]);
  });
});

describe("versioned member settings", () => {
  it("prefills the registered phone without creating an override or a redundant write", async () => {
    const draft = memberDraft(employee);
    expect(draft.closingDeliveryPhone).toBe("7705750450");
    expect(isMemberDraftDirty(employee, draft)).toBe(false);
    await saveMemberSettings("store", employee, draft, true, vi.fn());
    expect(request).not.toHaveBeenCalled();
  });
  it("only patches changed metadata and preserves the account phone fallback", async () => {
    request.mockResolvedValueOnce({ ...employee, displayName: "Annie", version: 8 });
    await saveMemberSettings("store", employee, { ...memberDraft(employee), displayName: " Annie " }, true, vi.fn());
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("/stores/store/members/amy", expect.objectContaining({ method: "PATCH", body: expect.objectContaining({ displayName: "Annie", version: 7, closingDeliveryPhoneE164: null }) }));
  });
  it("passes the metadata response version to the commission write and reports today's refresh", async () => {
    const progress = vi.fn();
    request.mockResolvedValueOnce({ ...employee, displayName: "Annie", version: 8 });
    request.mockResolvedValueOnce({ membership: { ...employee, displayName: "Annie", defaultCommissionBps: 6550, version: 9 }, refreshedCurrentDayRecordCount: 3 });
    const result = await saveMemberSettings("store", employee, { ...memberDraft(employee), displayName: "Annie", commissionPercent: "65.50" }, true, progress);
    expect(request).toHaveBeenNthCalledWith(2, "/stores/store/members/amy/commissions/default", { method: "PUT", idempotent: true, body: { version: 8, commissionBps: 6550 } });
    expect(progress.mock.calls.map(([member]) => member.version)).toEqual([8, 9]);
    expect(result.refreshedToday).toBe(true);
  });
  it("clears a default commission without touching member metadata", async () => {
    request.mockResolvedValueOnce({ membership: { ...employee, version: 8, defaultCommissionBps: null }, refreshedCurrentDayRecordCount: 0 });
    await saveMemberSettings("store", employee, { ...memberDraft(employee), commissionPercent: "" }, false, vi.fn());
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("/stores/store/members/amy/commissions/default", expect.objectContaining({ body: { version: 7, commissionBps: null } }));
  });
  it("validates every field before any metadata is written", async () => {
    const draft = { ...memberDraft(employee), displayName: "Changed", commissionPercent: "100.01" };
    await expect(saveMemberSettings("store", employee, draft, false, vi.fn())).rejects.toThrow("提成比例");
    await expect(saveMemberSettings("store", employee, { ...memberDraft(employee), employmentType: "" }, true, vi.fn())).rejects.toThrow("全职或兼职");
    await expect(saveMemberSettings("store", employee, { ...memberDraft(employee), closingDeliveryPhone: "123" }, false, vi.fn())).rejects.toThrow("10 位");
    await expect(saveMemberSettings("store", { ...employee, user: null }, { ...memberDraft({ ...employee, user: null }), displayName: "Changed" }, false, vi.fn())).rejects.toThrow("注册手机号");
    expect(request).not.toHaveBeenCalled();
  });
  it("protects the owner role and participation settings while allowing profile changes", async () => {
    await expect(saveMemberSettings("store", employee, { ...memberDraft(employee), role: "OWNER" }, false, vi.fn())).rejects.toThrow("店主身份");
    const owner = { ...employee, role: "OWNER" as const };
    await expect(saveMemberSettings("store", owner, { ...memberDraft(owner), isServiceProvider: false }, false, vi.fn())).rejects.toThrow("店主身份");
    request.mockResolvedValueOnce({ ...owner, displayName: "Annie", version: 8 });
    await saveMemberSettings("store", owner, { ...memberDraft(owner), displayName: "Annie" }, true, vi.fn());
    const body = request.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("role");
    expect(body).not.toHaveProperty("isServiceProvider");
  });
  it("stops after a metadata conflict and retains progress after a commission failure", async () => {
    const draft = { ...memberDraft(employee), displayName: "Annie", commissionPercent: "65" };
    request.mockRejectedValueOnce(new Error("conflict"));
    await expect(saveMemberSettings("store", employee, draft, true, vi.fn())).rejects.toThrow("conflict");
    expect(request).toHaveBeenCalledTimes(1);
    request.mockReset();
    const progress = vi.fn();
    request.mockResolvedValueOnce({ ...employee, displayName: "Annie", version: 8 });
    request.mockRejectedValueOnce(new Error("commission unavailable"));
    await expect(saveMemberSettings("store", employee, draft, true, progress)).rejects.toThrow("commission unavailable");
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Annie", version: 8 }));
  });
  it("supports phone override removal and exact commission precision", async () => {
    const dedicated = { ...employee, closingDeliveryPhoneE164: "+12125550100" };
    request.mockResolvedValueOnce({ ...dedicated, closingDeliveryPhoneE164: null, version: 8 });
    await saveMemberSettings("store", dedicated, { ...memberDraft(dedicated), closingDeliveryPhone: "" }, true, vi.fn());
    expect(request).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: expect.objectContaining({ closingDeliveryPhoneE164: null, closingDeliveryEnabled: true }) }));
    expect(parseCommissionPercent("0")).toBe(0);
    expect(parseCommissionPercent("100")).toBe(10000);
    expect(parseCommissionPercent("33.33")).toBe(3333);
    expect(() => parseCommissionPercent("60.001")).toThrow();
    expect(() => parseCommissionPercent("-1")).toThrow();
  });
});
