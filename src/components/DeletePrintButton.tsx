"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale } from "@/lib/locale";

export function DeletePrintButton({ id }: { id: string }) {
  const router = useRouter();
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);

  return (
    <button
      onClick={async () => {
        if (!confirm(t("print.deleteConfirm"))) return;
        setBusy(true);
        await fetch(`/api/prints/${id}`, { method: "DELETE" });
        router.push("/");
        router.refresh();
      }}
      disabled={busy}
      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
    >
      {busy ? t("print.deleting") : t("print.delete")}
    </button>
  );
}
