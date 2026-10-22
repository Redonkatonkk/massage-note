import { describe, expect, it } from "vitest";
import { demoKey, demoRequest, DemoRequestError } from "./client";
import snapshot from "./responses.json";

const store = "/stores/10000000-0000-4000-8000-000000000001";

describe("public portfolio snapshot", () => {
  it("serves independent copies and normalizes only equivalent default filters", () => {
    const a = demoRequest("/me") as { firstName: string };
    a.firstName = "Modified";
    expect(demoRequest("/me")).not.toEqual(a);
    expect(demoKey("/finance?amountType=ALL&dateTo=2026-10-22&paymentMethod=ALL&dateFrom=2026-10-01"))
      .toBe("/finance?dateFrom=2026-10-01&dateTo=2026-10-22");
    expect(demoKey("/finance?membershipIds=someone&paymentMethod=CASH"))
      .toBe("/finance?membershipIds=someone&paymentMethod=CASH");
  });

  it("blocks every user write and unknown read without a network fallback", () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      for (const path of ["/auth/dev-session", `${store}/work-records`, `${store}/data/import/confirm`, `${store}/ai/work/messages`]) {
        expect(() => demoRequest(path, method)).toThrow(/read-only/);
      }
    }
    expect(demoRequest(`${store}/boards/2026-10-22/apply-weekly-dispatch`, "POST")).toBeNull();
    expect(() => demoRequest("/stores/another-store/catalog")).toThrow(DemoRequestError);
    expect(() => demoRequest(`${store}/finance/summary?dateFrom=2099-01-01`)).toThrow(/outside the demo snapshot/);
  });

  it("covers default page requests and all analytics quick ranges", () => {
    for (const suffix of ["", "/catalog?includeDeleted=true", "/members", "/business-days/current", "/boards/2026-10-22", "/gift-card-sales", "/payroll-settlements?includeDeleted=true", "/expenses?month=2026-10", "/audit-logs?limit=30", "/cash-settlements/2026-10-22", "/closings/2026-10-22/preview", "/work-bot", "/work-records/deleted", "/gift-card-sales/deleted"]) {
      expect(demoRequest(store + suffix), suffix).toBeDefined();
    }
    for (const filter of ["ALL", "ONLY_HIGHLIGHTED", "EXCLUDE_HIGHLIGHTED"]) {
      for (const range of ["", "&dateFrom=2026-10-16&dateTo=2026-10-22", "&dateFrom=2026-09-23&dateTo=2026-10-22", "&dateFrom=2026-10-01&dateTo=2026-10-22"]) {
        const data = demoRequest(`${store}/finance/analytics?highlightFilter=${filter}${range}`) as { dateFrom: string; dateTo: string; days: unknown[] };
        expect(data.days.length).toBeGreaterThan(0);
        expect(demoRequest(`${store}/finance/summary?highlightFilter=${filter}&dateFrom=${data.dateFrom}&dateTo=${data.dateTo}&paymentMethod=ALL&amountType=ALL`)).toBeDefined();
      }
    }
  });

  it("publishes synthetic identity data and no authentication credentials", () => {
    const serialized = JSON.stringify(snapshot);
    expect(snapshot.source).toContain("Isolated synthetic");
    expect(serialized).not.toMatch(/17705750450|mna_|mnw_|PRIVATE KEY|refreshToken|sessionCookie|passwordHash/);
    expect(demoRequest("/me")).toMatchObject({ phoneE164: "+12025550100" });
  });
});
