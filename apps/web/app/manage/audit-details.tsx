import { formatUsdPrecise } from "../../lib/money";
import type { AuditLogItem } from "../../lib/types";
import { RecordFacts } from "../ui/responsive-data-view";

const labels: Record<string, string> = {
  name: "名称", displayName: "店内显示名", requestedDisplayName: "申请姓名", fullName: "完整名称", shortName: "简称", role: "角色", status: "状态",
  isServiceProvider: "参与记工", employmentType: "全职或兼职", dailySettlementEnabled: "每日结清", closingDeliveryEnabled: "接收日结短信",
  closingDeliveryPhoneE164: "短信接收号码", closingImageLocale: "图片语言", closingDefaultLocale: "默认图片语言", timezone: "时区", businessCutoffLocal: "营业日截止时间",
  automaticDispatchEnabled: "每日开门排位", isEnabled: "启用", isHighlighted: "高亮记工", businessDate: "营业日", serviceName: "项目", startAt: "开始时间", endAt: "结束时间", deletedAt: "删除时间", deleteReason: "删除原因", note: "备注",
  amountCents: "金额", grossFeeBaseCents: "大费基数", faceValueCents: "礼物卡面值", totalPaidCents: "实付工资", cashServiceCents: "现金大费", cardServiceCents: "刷卡大费", giftCardServiceCents: "礼物卡大费", cashTipCents: "现金小费", cardTipCents: "刷卡小费", giftCardTipCents: "礼物卡小费",
  commissionBps: "提成比例", defaultCommissionBps: "员工默认提成", globalCommissionBps: "店铺默认提成", periodStart: "开始日期", periodEnd: "结束日期", paymentScope: "工资来源", serialNumber: "序列号", durationMinutes: "时间（分钟）",
  mondayThursdayAutoDiscountEnabled: "周一至周四自动折扣", mondayThursdayAutoDiscountThresholdCents: "自动折扣门槛", mondayThursdayAutoDiscountAmountCents: "自动折扣金额", giftCardAutoDiscountEnabled: "礼物卡自动折扣", giftCardAutoDiscountThresholdCents: "礼物卡折扣门槛", giftCardAutoDiscountBps: "礼物卡折扣比例",
};
const values: Record<string, string> = { OWNER: "店主", MANAGER: "经理", EMPLOYEE: "员工", ACTIVE: "启用", INACTIVE: "已停用", PENDING: "待审核", WORKING: "正在记工", CONFIRMED: "已确认", OPEN: "营业中", CLOSED: "已日结", FULL_TIME: "全职", PART_TIME: "兼职", CASH: "现金", NON_CASH: "刷卡＋礼物卡", ALL: "全部", zh_CN: "中文", en_US: "English" };
const enumFields = new Set(["role", "status", "employmentType", "paymentScope", "closingImageLocale", "closingDefaultLocale"]);

/** Summaries only describe known scalar fields; the complete original snapshots remain available. */
export function auditFacts(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
  return Object.entries(snapshot).flatMap(([key, value]) => {
    if (!labels[key] || (value !== null && typeof value === "object")) return [];
    let display = value === null ? "未设置" : typeof value === "boolean" ? value ? "是" : "否" : enumFields.has(key) ? values[String(value)] ?? String(value) : String(value);
    const numeric = typeof value === "number" || typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : NaN;
    if (key.endsWith("Cents") && Number.isSafeInteger(numeric)) display = formatUsdPrecise(numeric);
    if (key.endsWith("Bps") && Number.isSafeInteger(numeric)) display = `${numeric / 100}%`;
    if (["businessDate", "periodStart", "periodEnd"].includes(key) && typeof value === "string") display = value.slice(0, 10);
    if (key.endsWith("At") && typeof value === "string" && Number.isFinite(Date.parse(value))) display = new Date(value).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" });
    return [{ label: labels[key], value: display }];
  });
}

export function AuditDetails({ item, entityLabel }: { item: AuditLogItem; entityLabel: string }) {
  const snapshots = [["修改前", item.beforeJson], ["修改后", item.afterJson]] as const;
  return <div className="audit-detail">
    <RecordFacts items={[{ label: "对象类型", value: entityLabel }, ...(item.reason ? [{ label: "原因", value: item.reason, wide: true }] : [])]} />
    <div className="audit-snapshots">{snapshots.map(([title, value]) => <section key={title}><h3>{title}</h3>{auditFacts(value).length ? <RecordFacts items={auditFacts(value)} /> : <p className="field-help">{value === null ? "无" : "详细变更见原始数据"}</p>}</section>)}</div>
    <details className="audit-raw"><summary>查看完整原始数据</summary><RecordFacts items={[{ label: "记录编号", value: item.entityId, wide: true }, { label: "请求编号", value: item.requestId, wide: true }]} /><div className="audit-snapshots">{snapshots.map(([title, value]) => <section key={title}><h3>{title}</h3><pre>{value === null ? "无" : JSON.stringify(value, null, 2)}</pre></section>)}</div></details>
  </div>;
}
