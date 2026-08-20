"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiRequest, errorMessage } from "../lib/api";
import {
  endLocalDateTimeForDuration,
  localDateTimeValue,
  zonedLocalToIso,
} from "../lib/time";
import type {
  AddonItem,
  CatalogResponse,
  DiscountItem,
  StoreDetails,
  StoreMember,
  WorkRecord,
} from "../lib/types";

interface RecordEditorProps {
  storeId: string;
  timezone: string;
  businessDate: string;
  autoDiscountSettings: Pick<StoreDetails,
    | "mondayThursdayAutoDiscountEnabled"
    | "mondayThursdayAutoDiscountThresholdCents"
    | "mondayThursdayAutoDiscountAmountCents"
  >;
  record: WorkRecord;
  catalog: CatalogResponse;
  members: StoreMember[];
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
  onChanged: () => Promise<void>;
}

interface AddonDraft {
  key: string;
  sourceItemId: string;
  name: string;
  shortName: string;
  amount: string;
  durationMinutes: string;
  commissionPercent: string;
}

interface DiscountDraft {
  key: string;
  sourceItemId: string;
  name: string;
  amount: string;
}

function dollars(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

function cents(value: string, label: string): number {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value.trim())) {
    throw new Error(`${label}必须是非负金额，最多保留两位小数`);
  }
  return Math.round(Number(value) * 100);
}

function draftCents(value: string): number | null {
  return /^\d+(?:\.\d{0,2})?$/.test(value.trim()) ? Math.round(Number(value) * 100) : null;
}

function percentToBps(value: string, label: string): number {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value.trim())) {
    throw new Error(`${label}必须是 0 到 100 之间的数字`);
  }
  const result = Math.round(Number(value) * 100);
  if (result < 0 || result > 10_000) throw new Error(`${label}不能超过 100%`);
  return result;
}

function addonFromItem(item: AddonItem): AddonDraft {
  return {
    key: crypto.randomUUID(),
    sourceItemId: item.id,
    name: item.name,
    shortName: item.shortName,
    amount: dollars(item.amountCents),
    durationMinutes: item.durationMinutes?.toString() ?? "",
    commissionPercent: "",
  };
}

function discountFromItem(item: DiscountItem): DiscountDraft {
  return {
    key: crypto.randomUUID(),
    sourceItemId: item.id,
    name: item.name,
    amount: dollars(item.amountCents),
  };
}

export function RecordEditor({
  storeId,
  timezone,
  businessDate,
  autoDiscountSettings,
  record,
  catalog,
  members,
  canManage,
  onClose,
  onSaved,
  onChanged,
}: RecordEditorProps) {
  const actionInFlight = useRef(false);
  const [recordVersion, setRecordVersion] = useState(record.version);
  const service = record.serviceSnapshot;
  const initialStart = localDateTimeValue(record.startAt, timezone);
  const initialEnd = record.endAt ? localDateTimeValue(record.endAt, timezone) : "";
  const initialAddons = useMemo<AddonDraft[]>(
    () =>
      record.addonSnapshots.map((item) => ({
        key: item.id,
        sourceItemId: item.sourceAddonItemId ?? "__custom__",
        name: item.name,
        shortName: item.shortName,
        amount: dollars(item.amountCents),
        durationMinutes: item.durationMinutes?.toString() ?? "",
        commissionPercent: "",
      })),
    [record.addonSnapshots],
  );
  const initialDiscounts = useMemo<DiscountDraft[]>(
    () =>
      record.discountSnapshots.filter((item) => !item.isAutomatic).map((item) => ({
        key: item.id,
        sourceItemId: item.sourceDiscountItemId ?? "__custom__",
        name: item.name,
        amount: dollars(item.amountCents),
      })),
    [record.discountSnapshots],
  );
  const automaticDiscounts = useMemo(
    () => record.discountSnapshots.filter((item) => item.isAutomatic),
    [record.discountSnapshots],
  );
  const [employeeId, setEmployeeId] = useState(record.employeeMembershipId);
  const [startAt, setStartAt] = useState(initialStart);
  const [endAt, setEndAt] = useState(initialEnd);
  const [serviceChoice, setServiceChoice] = useState(
    service?.sourceServiceItemId ?? "__custom__",
  );
  const [serviceName, setServiceName] = useState(service?.name ?? "");
  const [serviceShortName, setServiceShortName] = useState(service?.shortName ?? "");
  const [serviceDuration, setServiceDuration] = useState(
    service?.durationMinutes.toString() ?? "60",
  );
  const [serviceAmount, setServiceAmount] = useState(
    dollars(service?.amountCents ?? record.mainServiceAmountCents),
  );
  const [serviceCommission, setServiceCommission] = useState(
    ((service?.commissionBps ?? 0) / 100).toFixed(2),
  );
  const [addons, setAddons] = useState(initialAddons);
  const [discounts, setDiscounts] = useState(initialDiscounts);
  const [automaticDiscountSuppressed, setAutomaticDiscountSuppressed] = useState(
    record.automaticDiscountSuppressed,
  );
  const [isHighlighted, setIsHighlighted] = useState(record.isHighlighted);
  const [cashService, setCashService] = useState(dollars(record.cashServiceCents));
  const [cardService, setCardService] = useState(dollars(record.cardServiceCents));
  const [usesGiftCard, setUsesGiftCard] = useState(
    Boolean(record.giftCardSerialNumber) ||
      (record.giftCardServiceCents ?? 0) > 0 ||
      (record.giftCardTipCents ?? 0) > 0,
  );
  const [giftCardSerialNumber, setGiftCardSerialNumber] = useState(
    record.giftCardSerialNumber ?? "",
  );
  const [giftCardService, setGiftCardService] = useState(
    dollars(record.giftCardServiceCents),
  );
  const [cashTip, setCashTip] = useState(dollars(record.cashTipCents));
  const [cardTip, setCardTip] = useState(dollars(record.cardTipCents));
  const [giftCardTip, setGiftCardTip] = useState(dollars(record.giftCardTipCents));
  const [tipSettled, setTipSettled] = useState(record.tipSettledManualFlag);
  const [largeFeeSettled, setLargeFeeSettled] = useState(
    record.largeFeeSettledManualFlag,
  );
  const [note, setNote] = useState(record.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const draftKey = `massage_note_record_draft_${record.id}`;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as Record<string, unknown>;
        const savedAt = typeof draft.savedAt === "number" ? draft.savedAt : 0;
        if (draft.recordVersion === record.version && Date.now() - savedAt <= 7 * 24 * 60 * 60_000) {
          if (typeof draft.employeeId === "string") setEmployeeId(draft.employeeId);
          if (typeof draft.startAt === "string") setStartAt(draft.startAt);
          if (typeof draft.endAt === "string") setEndAt(draft.endAt);
          if (typeof draft.serviceChoice === "string") setServiceChoice(draft.serviceChoice);
          if (typeof draft.serviceName === "string") setServiceName(draft.serviceName);
          if (typeof draft.serviceShortName === "string") setServiceShortName(draft.serviceShortName);
          if (typeof draft.serviceDuration === "string") setServiceDuration(draft.serviceDuration);
          if (typeof draft.serviceAmount === "string") setServiceAmount(draft.serviceAmount);
          if (typeof draft.serviceCommission === "string") setServiceCommission(draft.serviceCommission);
          if (Array.isArray(draft.addons)) setAddons(draft.addons as AddonDraft[]);
          if (Array.isArray(draft.discounts)) setDiscounts(draft.discounts as DiscountDraft[]);
          if (typeof draft.automaticDiscountSuppressed === "boolean") {
            setAutomaticDiscountSuppressed(draft.automaticDiscountSuppressed);
          }
          if (typeof draft.isHighlighted === "boolean") {
            setIsHighlighted(draft.isHighlighted);
          }
          if (typeof draft.cashService === "string") setCashService(draft.cashService);
          if (typeof draft.cardService === "string") setCardService(draft.cardService);
          if (typeof draft.usesGiftCard === "boolean") setUsesGiftCard(draft.usesGiftCard);
          if (typeof draft.giftCardSerialNumber === "string") setGiftCardSerialNumber(draft.giftCardSerialNumber);
          if (typeof draft.giftCardService === "string") setGiftCardService(draft.giftCardService);
          if (typeof draft.cashTip === "string") setCashTip(draft.cashTip);
          if (typeof draft.cardTip === "string") setCardTip(draft.cardTip);
          if (typeof draft.giftCardTip === "string") setGiftCardTip(draft.giftCardTip);
          if (typeof draft.tipSettled === "boolean") setTipSettled(draft.tipSettled);
          if (typeof draft.largeFeeSettled === "boolean") setLargeFeeSettled(draft.largeFeeSettled);
          if (typeof draft.note === "string") setNote(draft.note);
          setDraftDirty(true);
        } else {
          window.localStorage.removeItem(draftKey);
        }
      }
    } catch {
      window.localStorage.removeItem(draftKey);
    } finally {
      setDraftLoaded(true);
    }
  }, [draftKey, record.version]);

  useEffect(() => {
    if (!draftLoaded || !draftDirty) return;
    window.localStorage.setItem(draftKey, JSON.stringify({ savedAt: Date.now(), recordVersion: record.version, employeeId, startAt, endAt, serviceChoice, serviceName, serviceShortName, serviceDuration, serviceAmount, serviceCommission, addons, discounts, automaticDiscountSuppressed, isHighlighted, cashService, cardService, usesGiftCard, giftCardSerialNumber, giftCardService, cashTip, cardTip, giftCardTip, tipSettled, largeFeeSettled, note }));
  }, [draftLoaded, draftDirty, draftKey, record.version, employeeId, startAt, endAt, serviceChoice, serviceName, serviceShortName, serviceDuration, serviceAmount, serviceCommission, addons, discounts, automaticDiscountSuppressed, isHighlighted, cashService, cardService, usesGiftCard, giftCardSerialNumber, giftCardService, cashTip, cardTip, giftCardTip, tipSettled, largeFeeSettled, note]);

  const initialAddonSignature = JSON.stringify(
    initialAddons.map(({ key: _key, ...item }) => item),
  );
  const initialDiscountSignature = JSON.stringify(
    initialDiscounts.map(({ key: _key, ...item }) => item),
  );

  function chooseService(value: string) {
    setServiceChoice(value);
    if (value === "__custom__") return;
    const item = catalog.serviceItems.find((candidate) => candidate.id === value);
    if (!item) return;
    const option = item.priceOptions[0];
    if (!option) return;
    setServiceName(item.fullName);
    setServiceShortName(item.shortName);
    setServiceDuration(option.durationMinutes.toString());
    setServiceAmount(dollars(option.priceCents));
    setEndAt(endLocalDateTimeForDuration(startAt, option.durationMinutes, timezone));
  }

  function chooseServiceDuration(value: string) {
    setServiceDuration(value);
    const item = catalog.serviceItems.find((candidate) => candidate.id === serviceChoice);
    const option = item?.priceOptions.find(
      (candidate) => candidate.durationMinutes.toString() === value,
    );
    if (option) {
      setServiceAmount(dollars(option.priceCents));
      setEndAt(endLocalDateTimeForDuration(startAt, option.durationMinutes, timezone));
    }
  }

  function changeCustomServiceDuration(value: string) {
    setServiceDuration(value);
    const durationMinutes = Number(value);
    if (Number.isInteger(durationMinutes) && durationMinutes >= 1 && durationMinutes <= 720) {
      setEndAt(endLocalDateTimeForDuration(startAt, durationMinutes, timezone));
    }
  }

  function updateAddon(key: string, changes: Partial<AddonDraft>) {
    setDraftDirty(true);
    setAddons((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    );
  }

  function selectAddon(key: string, value: string) {
    if (value === "__custom__") {
      updateAddon(key, {
        sourceItemId: value,
        name: "自定义额外项目",
        shortName: "自定义",
        amount: "0.00",
        durationMinutes: "",
        commissionPercent: "",
      });
      return;
    }
    const item = catalog.addonItems.find((candidate) => candidate.id === value);
    if (!item) return;
    updateAddon(key, {
      sourceItemId: item.id,
      name: item.name,
      shortName: item.shortName,
      amount: dollars(item.amountCents),
      durationMinutes: item.durationMinutes?.toString() ?? "",
      commissionPercent: "",
    });
  }

  function updateDiscount(key: string, changes: Partial<DiscountDraft>) {
    setDraftDirty(true);
    setDiscounts((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    );
  }

  function selectDiscount(key: string, value: string) {
    if (value === "__custom__") {
      updateDiscount(key, {
        sourceItemId: value,
        name: "自定义折扣",
        amount: "0.00",
      });
      return;
    }
    const item = catalog.discountItems.find((candidate) => candidate.id === value);
    if (item) {
      updateDiscount(key, {
        sourceItemId: item.id,
        name: item.name,
        amount: dollars(item.amountCents),
      });
    }
  }

  function removeAutomaticDiscount() {
    if (!window.confirm("确认只为这笔记工移除自动折扣吗？员工收入不会改变。")) return;
    setDraftDirty(true);
    setAutomaticDiscountSuppressed(true);
  }

  function buildUpdate(version: number) {
    const payload: Record<string, unknown> = {
      version,
      note,
      tipSettledManualFlag: tipSettled,
      largeFeeSettledManualFlag: largeFeeSettled,
    };
    if (employeeId !== record.employeeMembershipId) {
      payload.employeeMembershipId = employeeId;
    }
    if (startAt !== initialStart) payload.startAt = zonedLocalToIso(startAt, timezone);
    if (endAt !== initialEnd) {
      payload.endAt = endAt ? zonedLocalToIso(endAt, timezone) : null;
    }
    const amountCents = cents(serviceAmount, "主要项目金额");
    if (amountCents !== service?.amountCents) payload.mainServiceAmountCents = amountCents;
    const originalChoice = service?.sourceServiceItemId ?? "__custom__";
    if (
      serviceChoice !== "__custom__" &&
      (serviceChoice !== originalChoice ||
        Number(serviceDuration) !== service?.durationMinutes)
    ) {
      payload.serviceItemId = serviceChoice;
      payload.serviceDurationMinutes = Number(serviceDuration);
    } else if (serviceChoice !== originalChoice) {
      if (serviceChoice === "__custom__") {
        payload.customService = {
          name: serviceName.trim(),
          shortName: serviceShortName.trim(),
          amountCents,
          durationMinutes: Number(serviceDuration),
        };
      }
    } else if (
      serviceChoice === "__custom__" &&
      (serviceName !== service?.name ||
        serviceShortName !== service?.shortName ||
        Number(serviceDuration) !== service?.durationMinutes)
    ) {
      payload.customService = {
        name: serviceName.trim(),
        shortName: serviceShortName.trim(),
        amountCents,
        durationMinutes: Number(serviceDuration),
      };
    }
    if (canManage) {
      const commissionBps = percentToBps(serviceCommission, "主要项目提成");
      if (commissionBps !== service?.commissionBps) {
        payload.mainServiceCommissionBps = commissionBps;
      }
    }
    const addonSignature = JSON.stringify(addons.map(({ key: _key, ...item }) => item));
    if (addonSignature !== initialAddonSignature) {
      payload.addons = addons.map((item) => ({
        sourceItemId: item.sourceItemId === "__custom__" ? undefined : item.sourceItemId,
        isCustom: item.sourceItemId === "__custom__",
        name: item.name.trim(),
        shortName: item.shortName.trim(),
        amountCents: cents(item.amount, `额外项目“${item.name}”金额`),
        durationMinutes: item.durationMinutes === "" ? null : Number(item.durationMinutes),
        ...(canManage && item.commissionPercent !== ""
          ? {
              commissionBps: percentToBps(
                item.commissionPercent,
                `额外项目“${item.name}”提成`,
              ),
            }
          : {}),
      }));
    }
    const discountSignature = JSON.stringify(
      discounts.map(({ key: _key, ...item }) => item),
    );
    if (discountSignature !== initialDiscountSignature) {
      payload.discounts = discounts.map((item) => ({
        sourceItemId:
          item.sourceItemId === "__custom__" ? undefined : item.sourceItemId,
        isCustom: item.sourceItemId === "__custom__",
        name: item.name.trim(),
        amountCents: cents(item.amount, `折扣“${item.name}”金额`),
      }));
    }
    if (automaticDiscountSuppressed !== record.automaticDiscountSuppressed) {
      payload.automaticDiscountSuppressed = automaticDiscountSuppressed;
    }
    if (isHighlighted !== record.isHighlighted) {
      payload.isHighlighted = isHighlighted;
    }
    return payload;
  }

  async function saveDetails(): Promise<WorkRecord> {
    try {
      const updated = await apiRequest<WorkRecord>(`/stores/${storeId}/work-records/${record.id}`, {
        method: "PATCH",
        idempotent: true,
        body: buildUpdate(recordVersion),
      });
      setRecordVersion(updated.version);
      return updated;
    } catch (caught) {
      const latest = caught instanceof ApiError && caught.code === "WORK_RECORD_VERSION_CONFLICT"
        ? caught.latestResource as { version?: unknown } | undefined
        : undefined;
      if (typeof latest?.version === "number") setRecordVersion(latest.version);
      throw caught;
    }
  }

  async function run(action: () => Promise<void>) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }

  function finish() {
    window.localStorage.removeItem(draftKey);
    onSaved();
    onClose();
    void onChanged();
  }

  async function confirmPayment() {
    const servicePayments: Record<string, number> = {};
    if (cashService !== "") servicePayments.cashServiceCents = cents(cashService, "现金大费");
    if (cardService !== "") servicePayments.cardServiceCents = cents(cardService, "刷卡大费");
    let giftCardPayment: Record<string, string | number | null> = {
      giftCardServiceCents: 0,
      giftCardTipCents: 0,
    };
    if (usesGiftCard) {
      const serialNumber = giftCardSerialNumber.trim();
      if (!serialNumber) throw new Error("使用礼物卡时必须填写序列号");
      const giftCardServiceCents = giftCardService === "" ? 0 : cents(giftCardService, "礼物卡大费");
      const giftCardTipCents = giftCardTip === "" ? 0 : cents(giftCardTip, "礼物卡小费");
      if (giftCardServiceCents + giftCardTipCents <= 0) {
        throw new Error("使用礼物卡时，大费或小费金额必须大于 0");
      }
      servicePayments.giftCardServiceCents = giftCardServiceCents;
      giftCardPayment = { giftCardSerialNumber: serialNumber, giftCardServiceCents, giftCardTipCents };
    }
    const tipPayments = {
      cashTipCents: cashTip === "" ? 0 : cents(cashTip, "现金小费"),
      cardTipCents: cardTip === "" ? 0 : cents(cardTip, "刷卡小费"),
    };
    if (Object.keys(servicePayments).length === 0) {
      throw new Error("现金、刷卡和礼物卡大费至少填写一项；免费服务请填写 0");
    }
    const updated = await saveDetails();
    await apiRequest(`/stores/${storeId}/work-records/${record.id}/confirm-payment`, {
      method: "POST",
      idempotent: true,
      body: { version: updated.version, ...servicePayments, ...tipPayments, ...giftCardPayment },
    });
    await finish();
  }

  const draftMainAmount = draftCents(serviceAmount);
  const draftAddonAmounts = addons.map((item) => draftCents(item.amount));
  const draftDiscountAmounts = discounts.map((item) => draftCents(item.amount));
  const draftGross = draftMainAmount !== null && draftAddonAmounts.every((value) => value !== null)
    ? draftMainAmount + draftAddonAmounts.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;
  const weekday = new Date(`${businessDate}T00:00:00.000Z`).getUTCDay();
  const draftAutomaticDiscount =
    !automaticDiscountSuppressed &&
    draftGross !== null &&
    autoDiscountSettings.mondayThursdayAutoDiscountEnabled &&
    weekday >= 1 && weekday <= 4 &&
    draftGross >= autoDiscountSettings.mondayThursdayAutoDiscountThresholdCents
      ? autoDiscountSettings.mondayThursdayAutoDiscountAmountCents
      : 0;
  const draftDiscountTotal = draftDiscountAmounts.every((value) => value !== null)
    ? draftDiscountAmounts.reduce<number>((sum, value) => sum + (value ?? 0), 0) + draftAutomaticDiscount
    : null;
  const draftDiscounted = draftGross !== null && draftDiscountTotal !== null ? draftGross - draftDiscountTotal : null;
  const draftCashService = draftCents(cashService || "0");
  const draftCardService = draftCents(cardService || "0");
  const draftGiftCardService = draftCents(usesGiftCard ? giftCardService || "0" : "0");
  const draftServicePaid = cashService !== "" || cardService !== "" || usesGiftCard
    ? draftCashService !== null && draftCardService !== null && draftGiftCardService !== null ? draftCashService + draftCardService + draftGiftCardService : null
    : null;
  const draftDifference = draftServicePaid !== null && draftDiscounted !== null ? draftServicePaid - draftDiscounted : null;
  const selectedCatalogService = catalog.serviceItems.find(
    (item) => item.id === serviceChoice,
  );
  const hasCurrentDuration = selectedCatalogService?.priceOptions.some(
    (option) => option.durationMinutes.toString() === serviceDuration,
  );

  return (
    <div className="modal-backdrop modal-backdrop--editor" role="presentation">
      <section className="record-editor" role="dialog" aria-modal="true" aria-labelledby="record-title" onChangeCapture={() => setDraftDirty(true)}>
        <header className="modal-heading sticky-heading">
          <div>
            <p className="eyebrow">记工详情</p>
            <h2 id="record-title">{service?.name ?? "记工记录"}</h2>
          </div>
          <div className="modal-heading__actions">
            <button className={`highlight-toggle${isHighlighted ? " active" : ""}`} type="button" aria-pressed={isHighlighted} disabled={busy} onClick={() => { setDraftDirty(true); setIsHighlighted((current) => !current); }}><span aria-hidden="true">★</span>{isHighlighted ? "已高亮" : "高亮标记"}</button>
            <button className="close-button" type="button" onClick={onClose} disabled={busy}>关闭</button>
          </div>
        </header>

        <div className="editor-grid">
          <label className="field-label">所属员工
            <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              {members.filter((member) => member.status === "ACTIVE" && member.isServiceProvider).map((member) => (
                <option key={member.id} value={member.id}>{member.displayName}</option>
              ))}
            </select>
          </label>
          <label className="field-label">开始时间
            <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
          </label>
          <label className="field-label">结束时间
            <input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} />
          </label>
          <label className="field-label">主要项目
            <select value={serviceChoice} onChange={(event) => chooseService(event.target.value)}>
              {serviceChoice !== "__custom__" && !catalog.serviceItems.some((item) => item.id === serviceChoice && item.isEnabled && !item.deletedAt) && (
                <option value={serviceChoice}>{service?.name ?? "历史项目"}（历史项目）</option>
              )}
              {catalog.serviceItems.filter((item) => item.isEnabled && !item.deletedAt).map((item) => (
                <option key={item.id} value={item.id}>{item.fullName}</option>
              ))}
              <option value="__custom__">自定义项目</option>
            </select>
          </label>
          {serviceChoice === "__custom__" && (
            <>
              <label className="field-label">项目名称<input value={serviceName} onChange={(event) => setServiceName(event.target.value)} /></label>
              <label className="field-label">项目简称<input value={serviceShortName} onChange={(event) => setServiceShortName(event.target.value)} /></label>
              <label className="field-label">时长（分钟）<input type="number" min="1" max="720" value={serviceDuration} onChange={(event) => changeCustomServiceDuration(event.target.value)} /></label>
            </>
          )}
          {serviceChoice !== "__custom__" && (
            <label className="field-label">项目时长与价格
              <select value={serviceDuration} onChange={(event) => chooseServiceDuration(event.target.value)}>
                {!hasCurrentDuration && <option value={serviceDuration}>{serviceDuration} 分钟（历史档位）</option>}
                {selectedCatalogService?.priceOptions.map((option) => (
                  <option key={option.id} value={option.durationMinutes}>{option.durationMinutes} 分钟 · ${dollars(option.priceCents)}</option>
                ))}
              </select>
            </label>
          )}
          <label className="field-label">主要项目金额（美元）<input inputMode="decimal" value={serviceAmount} onChange={(event) => setServiceAmount(event.target.value)} /></label>
          <label className="field-label">本单主要项目提成（%）<input inputMode="decimal" value={serviceCommission} disabled={!canManage} onChange={(event) => setServiceCommission(event.target.value)} /><small>{canManage ? "修改会保留审计记录" : "只有店长或经理可以修改"}</small></label>
        </div>

        <section className="editor-section">
          <div className="section-heading"><h3>额外项目</h3><button type="button" onClick={() => { setDraftDirty(true); setAddons((current) => [...current, catalog.addonItems[0] ? addonFromItem(catalog.addonItems[0]) : { key: crypto.randomUUID(), sourceItemId: "__custom__", name: "自定义额外项目", shortName: "自定义", amount: "0.00", durationMinutes: "", commissionPercent: "" }]); }}>＋ 添加</button></div>
          {addons.length === 0 && <p className="empty-note">本单没有额外项目</p>}
          {addons.map((item) => (
            <div className="line-item" key={item.key}>
              <select value={item.sourceItemId} onChange={(event) => selectAddon(item.key, event.target.value)}>
                {catalog.addonItems.filter((candidate) => candidate.isEnabled && !candidate.deletedAt).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                <option value="__custom__">自定义额外项目</option>
              </select>
              {item.sourceItemId === "__custom__" && <input aria-label="额外项目名称" value={item.name} onChange={(event) => updateAddon(item.key, { name: event.target.value, shortName: event.target.value.slice(0, 30) })} />}
              <input aria-label="额外项目金额" inputMode="decimal" value={item.amount} onChange={(event) => updateAddon(item.key, { amount: event.target.value })} />
              {canManage && <input aria-label="额外项目提成百分比" inputMode="decimal" placeholder="提成 %（留空按规则）" value={item.commissionPercent} onChange={(event) => updateAddon(item.key, { commissionPercent: event.target.value })} />}
              <button className="danger-link" type="button" onClick={() => { setDraftDirty(true); setAddons((current) => current.filter((candidate) => candidate.key !== item.key)); }}>移除</button>
            </div>
          ))}
        </section>

        <section className="editor-section">
          <div className="section-heading"><h3>折扣</h3><button type="button" onClick={() => { setDraftDirty(true); setDiscounts((current) => [...current, catalog.discountItems[0] ? discountFromItem(catalog.discountItems[0]) : { key: crypto.randomUUID(), sourceItemId: "__custom__", name: "自定义折扣", amount: "0.00" }]); }}>＋ 添加</button></div>
          {automaticDiscountSuppressed ? (
            <div className="automatic-discount-line automatic-discount-line--removed">
              <div><strong>本单已手动移除自动折扣</strong><small>只影响这笔记工，不会关闭店铺的周一至周四自动折扣规则</small></div>
              <button className="secondary-action compact" type="button" onClick={() => { setDraftDirty(true); setAutomaticDiscountSuppressed(false); }}>恢复自动折扣</button>
            </div>
          ) : automaticDiscounts.map((item) => (
            <div className="automatic-discount-line" key={item.id}>
              <div><strong>{item.name}</strong><small>系统按营业日和折前大费自动应用，保存时会重新判断</small></div>
              <span>-{dollars(item.amountCents)}</span>
              <button className="danger-link" type="button" onClick={removeAutomaticDiscount}>移除</button>
            </div>
          ))}
          {!automaticDiscountSuppressed && automaticDiscounts.length === 0 && draftAutomaticDiscount > 0 && (
            <div className="automatic-discount-line">
              <div><strong>周一至周四自动折扣</strong><small>保存时将按当前店铺规则重新应用</small></div>
              <span>-{dollars(draftAutomaticDiscount)}</span>
              <button className="danger-link" type="button" onClick={removeAutomaticDiscount}>移除</button>
            </div>
          )}
          {discounts.length === 0 && automaticDiscounts.length === 0 && draftAutomaticDiscount === 0 && !automaticDiscountSuppressed && <p className="empty-note">本单没有折扣</p>}
          {discounts.map((item) => (
            <div className="line-item" key={item.key}>
              <select value={item.sourceItemId} onChange={(event) => selectDiscount(item.key, event.target.value)}>
                {catalog.discountItems.filter((candidate) => candidate.isEnabled && !candidate.deletedAt).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                <option value="__custom__">自定义折扣</option>
              </select>
              {item.sourceItemId === "__custom__" && <input aria-label="折扣名称" value={item.name} onChange={(event) => updateDiscount(item.key, { name: event.target.value })} />}
              <input aria-label="折扣金额" inputMode="decimal" value={item.amount} onChange={(event) => updateDiscount(item.key, { amount: event.target.value })} />
              <button className="danger-link" type="button" onClick={() => { setDraftDirty(true); setDiscounts((current) => current.filter((candidate) => candidate.key !== item.key)); }}>移除</button>
            </div>
          ))}
        </section>

        <section className="editor-section">
          <h3>客人付款</h3>
          <p className="field-help">现金、刷卡和礼物卡大费至少填一项。各类小费可以留空，系统会按 0 处理。</p>
          <div className="editor-grid editor-grid--money">
            <label className="field-label">现金大费（美元）<input inputMode="decimal" placeholder="可留空" value={cashService} onChange={(event) => setCashService(event.target.value)} /></label>
            <label className="field-label">刷卡大费（美元）<input inputMode="decimal" placeholder="可留空" value={cardService} onChange={(event) => setCardService(event.target.value)} /></label>
            <label className="field-label">现金小费（美元）<input inputMode="decimal" placeholder="可留空，按 0 计算" value={cashTip} onChange={(event) => setCashTip(event.target.value)} /></label>
            <label className="field-label">刷卡小费（美元）<input inputMode="decimal" placeholder="可留空，按 0 计算" value={cardTip} onChange={(event) => setCardTip(event.target.value)} /></label>
          </div>
          <label className="gift-card-toggle"><input type="checkbox" checked={usesGiftCard} onChange={(event) => setUsesGiftCard(event.target.checked)} /> 使用礼物卡付款</label>
          {usesGiftCard && <div className="editor-grid editor-grid--gift-card">
            <label className="field-label">礼物卡序列号<input maxLength={120} autoComplete="off" value={giftCardSerialNumber} onChange={(event) => setGiftCardSerialNumber(event.target.value)} /></label>
            <label className="field-label">礼物卡大费（美元）<input inputMode="decimal" placeholder="可填 0" value={giftCardService} onChange={(event) => setGiftCardService(event.target.value)} /></label>
            <label className="field-label">礼物卡小费（美元）<input inputMode="decimal" placeholder="可填 0" value={giftCardTip} onChange={(event) => setGiftCardTip(event.target.value)} /></label>
          </div>}
        </section>

        <section className="editor-section">
          <div className="check-grid">
            <label><input type="checkbox" checked={tipSettled} onChange={(event) => setTipSettled(event.target.checked)} /> 小费已人工结算</label>
            <label><input type="checkbox" checked={largeFeeSettled} onChange={(event) => setLargeFeeSettled(event.target.checked)} /> 大费已人工结算</label>
          </div>
          <label className="field-label">备注<textarea rows={4} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        </section>

        <section className="amount-explainer" aria-label="本单金额摘要">
          <div><span>大费总额（按当前填写）</span><strong>{draftGross === null ? "请检查金额" : `$${(draftGross / 100).toFixed(2)}`}</strong></div>
          <div><span>折后大费业绩（按当前填写）</span><strong>{draftDiscounted === null ? "请检查金额" : `$${(draftDiscounted / 100).toFixed(2)}`}</strong></div>
          <div><span>实收服务费（按当前填写）</span><strong>{draftServicePaid === null ? "未填写" : `$${(draftServicePaid / 100).toFixed(2)}`}</strong></div>
          <div><span>当前已保存员工大费工资</span><strong>${(record.totalLargeFeeWageCents / 100).toFixed(2)}</strong></div>
        </section>
        {draftDifference !== null && draftDifference !== 0 && <p className="mismatch-warning" role="status">实收服务费与折后大费业绩不一致，相差 ${Math.abs(draftDifference / 100).toFixed(2)}（{draftDifference > 0 ? "多收" : "少收"}）。系统允许确认，但会保留这条异常。</p>}

        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="editor-actions">
          <button className="delete-record" type="button" disabled={busy} onClick={() => run(async () => {
            if (!window.confirm("确认删除这条记工吗？删除后普通页面将隐藏，店长或经理可以恢复。")) return;
            const answer = window.prompt("删除原因（可不填）");
            if (answer === null) return;
            const reason = answer.trim() || undefined;
            await apiRequest(`/stores/${storeId}/work-records/${record.id}`, { method: "DELETE", idempotent: true, body: { version: record.version, ...(reason ? { reason } : {}) } });
            await finish();
          })}>删除记录</button>
          <span />
          <button className="secondary-action" type="button" disabled={busy} onClick={() => run(async () => { await saveDetails(); await finish(); })}>{busy ? "正在保存…" : "仅保存修改"}</button>
          <button className="primary-action" type="button" disabled={busy} onClick={() => run(confirmPayment)}>{busy ? "正在确认…" : record.status === "CONFIRMED" ? "保存并重新确认付款" : "保存并确认付款"}</button>
        </footer>
      </section>
    </div>
  );
}
