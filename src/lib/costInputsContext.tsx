"use client";

import { createContext, useContext, useState } from "react";
import type { PrintCostInputs } from "./types";

interface CostInputsContextValue {
  inputs: PrintCostInputs;
  update: <K extends keyof PrintCostInputs>(key: K, value: PrintCostInputs[K]) => void;
  saved: boolean;
  saveError: boolean;
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
  const [saveError, setSaveError] = useState(false);

  function update<K extends keyof PrintCostInputs>(key: K, value: PrintCostInputs[K]) {
    setInputs((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setSaveError(false);
  }

  async function save() {
    setSaveError(false);
    setSaved(false);
    try {
      const response = await fetch(`/api/prints/${printId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputs),
      });
      if (!response.ok) throw new Error(`Cost input save failed (${response.status}).`);
      setSaved(true);
    } catch (error) {
      console.error("Failed to save cost inputs:", error);
      setSaveError(true);
    }
  }

  return (
    <CostInputsContext.Provider value={{ inputs, update, saved, saveError, save }}>
      {children}
    </CostInputsContext.Provider>
  );
}

export function useCostInputs(): CostInputsContextValue {
  const ctx = useContext(CostInputsContext);
  if (!ctx) throw new Error("useCostInputs must be used within a CostInputsProvider");
  return ctx;
}
