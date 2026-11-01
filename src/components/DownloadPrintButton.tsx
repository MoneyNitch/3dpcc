"use client";

import { useState } from "react";
import { useLocale } from "@/lib/locale";

export function DownloadPrintButton({ id, fileName }: { id: string; fileName: string }) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function download() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/prints/${id}/download`);
      if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      console.error("Original archive download failed:", error);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={download} disabled={busy}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
        {t(busy ? "print.downloadingOriginal" : "print.downloadOriginal")}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{t("print.downloadOriginalError")}</p>}
    </div>
  );
}
