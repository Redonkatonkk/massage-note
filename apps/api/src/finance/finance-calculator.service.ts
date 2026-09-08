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
 * 无状态财务计算适配器。
 * 唯一公式来源是 domain 包；业务服务和此适配器均复用领域函数。
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

