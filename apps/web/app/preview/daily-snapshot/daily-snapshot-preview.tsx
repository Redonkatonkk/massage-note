"use client";

import { useState } from "react";
import { DailySnapshotView } from "../../daily-snapshot-view";
import { useLanguage } from "../../language-provider";
import { dailySnapshotFixtures, getPreviewMonthToDate } from "./fixtures";

const calendarData = {
  dates: dailySnapshotFixtures.filter(snapshot => !snapshot.isClosed && snapshot.records.length > 0).map(snapshot => snapshot.businessDate),
  closedDates: dailySnapshotFixtures.filter(snapshot => snapshot.isClosed).map(snapshot => ({ date: snapshot.businessDate, revenueCents: snapshot.employee.confirmedIncomeCents })),
};

export function DailySnapshotPreview() {
  const { locale } = useLanguage();
  const en = locale === "en-US";
  const [index, setIndex] = useState(dailySnapshotFixtures.length - 2);
  const snapshot = dailySnapshotFixtures[index]!;
  const firstDate = dailySnapshotFixtures[0]!.businessDate;
  const lastDate = dailySnapshotFixtures.at(-1)!.businessDate;

  function selectDate(date: string) {
    const next = dailySnapshotFixtures.findIndex(value => value.businessDate === date);
    if (next >= 0) setIndex(next);
  }

  return <main className="daily-snapshot-page" translate="no">
    <p className="daily-snapshot-preview-note">{en ? "Design preview · sample data" : "设计预览 · 示例数据"}</p>
    <DailySnapshotView
      storeName={snapshot.storeName} employeeName={snapshot.employee.displayName} date={snapshot.businessDate}
      minDate={firstDate} maxDate={lastDate} locale={locale} calendarData={calendarData} onSelectDate={selectDate}
      data={{ snapshot, monthToDate: getPreviewMonthToDate(snapshot.businessDate) }}
    />
  </main>;
}
