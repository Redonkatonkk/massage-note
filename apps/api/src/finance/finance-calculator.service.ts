import { Injectable } from "@nestjs/common";
import {
  calculateDailyCashSettlement,
  calculatePayrollBalance,
  calculateWorkRecordFinance,
  type DailyCashSettlement,
  type PayrollBalance,
  type WorkRecordFinance,
  type WorkRecordFinanceInput,
} from "@massage-note/domain";

/**
 * 财务计算的唯一应用服务入口。
 * Controller、AI 工具和结算任务都必须调用这里，不能各自重复公式。
 */
@Injectable()
export class FinanceCalculatorService {
  calculateRecord(input: WorkRecordFinanceInput): WorkRecordFinance {
    return calculateWorkRecordFinance(input);
  }

  calculateDailyCash(
    records: readonly WorkRecordFinance[],
  ): DailyCashSettlement {
    return calculateDailyCashSettlement(records);
  }

  calculateBalance(input: {
    cumulativeEmployeeIncomeCents: bigint;
    settledCashAcquiredCents: bigint;
    payrollPaidCents: bigint;
  }): PayrollBalance {
    return calculatePayrollBalance(input);
  }
}

