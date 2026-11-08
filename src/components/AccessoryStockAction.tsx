"use client";

import { useState } from "react";
import type { AccessoryMaterial } from "@/lib/types";
import { useLocale } from "@/lib/locale";

export function AccessoryStockAction({ source, sourceId, canBook, beforeBook, onBooked, disabled = false, onBusyChange }: {
  source: "print" | "order";
  sourceId: string;
  canBook: boolean;
  beforeBook?: () => Promise<boolean>;
  onBooked?: (accessories: AccessoryMaterial[]) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function book() {
    if (busy || disabled || !window.confirm(t("accessory.stockConfirm"))) return;
    setBusy(true);
    onBusyChange?.(true);
    setMessage(null);
    try {
      if (beforeBook && !(await beforeBook())) {
        setMessage({ error: true, text: t("cost.saveError") });
        return;
      }
      const response = await fetch("/api/accessory-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "consume", source, sourceId }),
      });
      const body: { code?: string; accessories?: AccessoryMaterial[] } = await response.json();
      if (!response.ok || !body.accessories) {
        const key = body.code === "duplicate" ? "accessory.stockAlreadyBooked" :
          body.code === "insufficient_stock" ? "accessory.stockInsufficient" :
            body.code === "stock_limit" ? "accessory.stockLimit" :
            body.code === "no_accessories" ? "accessory.stockNoItems" : "accessory.stockFailed";
        setMessage({ error: true, text: t(key) });
        return;
      }
      onBooked?.(body.accessories);
      setMessage({ error: false, text: t("accessory.stockBooked") });
    } catch (error) {
      console.error("Could not book accessory consumption:", error);
      setMessage({ error: true, text: t("accessory.stockFailed") });
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  if (!canBook) return null;
  return (
    <div className="mt-3">
      <button type="button" disabled={busy || disabled} onClick={() => void book()}
        className="rounded-lg border border-orange-400 px-3 py-1.5 text-sm font-medium text-orange-700 disabled:opacity-60 dark:text-orange-300">
        {busy ? t("accessory.stockBooking") : t("accessory.stockBook")}
      </button>
      {message && <p role={message.error ? "alert" : "status"}
        className={`mt-2 text-sm ${message.error ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
        {message.text}
      </p>}
    </div>
  );
}
