"use client";

import { createContext, useContext, useState } from "react";
import type { PrintCostInputs } from "./types";

interface CostInputsContextValue {
  inputs: PrintCostInputs;
  update: <K extends keyof PrintCostInputs>(key: K, value: PrintCostInputs[K]) => void;
  saved: boolean;
  save: () => Promise<void>;
}

const CostInputsContext = createContext<CostInputsContextValue | null>(null);

export function CostInputsProvider({
  printId,
  initialInputs,
  children,
}: {
  printId: string;
  initialInputs: PrintCostInputs;
  children: React.ReactNode;
}) {
  const [inputs, setInputs] = useState<PrintCostInputs>(initialInputs);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof PrintCostInputs>(key: K, value: PrintCostInputs[K]) {
    setInputs((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function save() {
    await fetch(`/api/prints/${printId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputs),
    });
    setSaved(true);
  }

  return (
    <CostInputsContext.Provider value={{ inputs, update, saved, save }}>
      {children}
    </CostInputsContext.Provider>
  );
}

export function useCostInputs(): CostInputsContextValue {
  const ctx = useContext(CostInputsContext);
  if (!ctx) throw new Error("useCostInputs must be used within a CostInputsProvider");
  return ctx;
}
