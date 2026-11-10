"use client";

import { createContext, useContext, useState } from "react";
import type { AccessoryMaterial, PrintCostInputs } from "./types";

interface CostInputsContextValue {
  inputs: PrintCostInputs;
  update: <K extends keyof PrintCostInputs>(key: K, value: PrintCostInputs[K]) => void;
  saved: boolean;
  saveError: boolean;
  save: () => Promise<boolean>;
  inventoryBusy: boolean;
  setInventoryBusy: (busy: boolean) => void;
  inventoryRevision: number;
  accessoryStock: AccessoryMaterial[] | null;
  inventoryChanged: (accessories?: AccessoryMaterial[]) => void;
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
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [inventoryRevision, setInventoryRevision] = useState(0);
  const [accessoryStock, setAccessoryStock] = useState<AccessoryMaterial[] | null>(null);

  function inventoryChanged(accessories?: AccessoryMaterial[]) {
    if (accessories) setAccessoryStock(accessories);
    setInventoryRevision((revision) => revision + 1);
  }

  function update<K extends keyof PrintCostInputs>(key: K, value: PrintCostInputs[K]) {
    setInputs((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setSaveError(false);
  }

  async function save(): Promise<boolean> {
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
      return true;
    } catch (error) {
      console.error("Failed to save cost inputs:", error);
      setSaveError(true);
      return false;
    }
  }

  return (
    <CostInputsContext.Provider value={{
      inputs, update, saved, saveError, save,
      inventoryBusy, setInventoryBusy, inventoryRevision, accessoryStock, inventoryChanged,
    }}>
      {children}
    </CostInputsContext.Provider>
  );
}

export function useCostInputs(): CostInputsContextValue {
  const ctx = useContext(CostInputsContext);
  if (!ctx) throw new Error("useCostInputs must be used within a CostInputsProvider");
  return ctx;
}
