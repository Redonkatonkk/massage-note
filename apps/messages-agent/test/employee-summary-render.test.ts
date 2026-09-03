import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderEmployeeSummaryImage, type EmployeeSummarySnapshot } from "../src/employee-summary-render.js";

const snapshot: EmployeeSummarySnapshot = {
  documentType: "EMPLOYEE_SUMMARY",
  storeName: "Massage Note",
  storeTimezone: "America/New_York",
  dateFrom: "2026-09-01",
  dateTo: "2026-09-02",
  paymentMethod: "ALL",
  amountType: "ALL",
  highlightFilter: "ALL",
  employees: [{
    membershipId: "10000000-0000-4000-8000-000000000001",
    displayName: "Amy",
    role: "EMPLOYEE",
    defaultCommissionBps: 6_000,
    hasDifferentItemCommission: true,
    recordCount: 2,
    mainServiceAmountCents: 10_050,
    addonTotalCents: 1_025,
    grossFeeBaseCents: 11_075,
    totalTipCents: 2_055,
    totalLargeFeeWageCents: 6_701,
    employeeIncomeCents: 8_756,
  }],
  generatedAt: "2026-09-02T16:00:00.000Z",
};

describe.skipIf(process.platform !== "darwin")("employee summary image", () => {
  it("生成保留美分、没有折扣栏的员工公式卡片", async () => {
    const directory = await mkdtemp(join(tmpdir(), "employee-summary-render-"));
    try {
      const output = join(directory, "summary.jpg");
      const result = await renderEmployeeSummaryImage(snapshot, "zh_CN", directory, output);
      expect(result.width).toBe(1080);
      expect((await readFile(output)).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      const svg = await readFile(join(directory, "employee-summary.svg"), "utf8");
      expect(svg).toContain("US$100.50");
      expect(svg).toContain("提成比例 60% · 部分项目比例不同");
      expect(svg).toContain("阶段总收入");
      expect(svg).toContain("显示当前提成设置");
      expect(svg).not.toContain("US$110.75 ×");
      expect(svg).not.toContain("折扣");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("旧版排队快照缺少提成设置时仍能生成可读图片", async () => {
    const directory = await mkdtemp(join(tmpdir(), "employee-summary-legacy-"));
    try {
      const employee: EmployeeSummarySnapshot["employees"][number] = {
        ...snapshot.employees[0],
      };
      delete employee.defaultCommissionBps;
      delete employee.hasDifferentItemCommission;
      await renderEmployeeSummaryImage(
        { ...snapshot, employees: [employee] },
        "zh_CN",
        directory,
        join(directory, "summary.jpg"),
      );
      const svg = await readFile(join(directory, "employee-summary.svg"), "utf8");
      expect(svg).toContain("提成比例 跟随项目/店铺");
      expect(svg).not.toContain("NaN%");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
