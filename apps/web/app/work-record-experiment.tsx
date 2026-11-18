"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { browserStorage } from "../lib/browser-storage";

const preferenceKey = "massage_note_work_record_experiment";
const WorkRecordExperiment = createContext({ experimental: false, setExperimental: (_enabled: boolean) => {} });

export function WorkRecordExperimentProvider({ children }: { children: ReactNode }) {
  const [experimental, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(browserStorage.getItem(preferenceKey) === "true");
  }, []);

  function setExperimental(enabled: boolean) {
    setEnabled(enabled);
    browserStorage.setItem(preferenceKey, String(enabled));
  }

  return <WorkRecordExperiment.Provider value={{ experimental, setExperimental }}>{children}</WorkRecordExperiment.Provider>;
}

export function useWorkRecordExperiment() {
  return useContext(WorkRecordExperiment);
}
