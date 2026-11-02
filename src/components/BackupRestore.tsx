"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/locale";

export function BackupRestore() {
  const router = useRouter();
  const { t } = useLocale();
  const [passphrase, setPassphrase] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"export" | "restore" | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setMessage(null);
  }

  async function exportBackup() {
    if (passphrase.length < 12) {
      setMessage({ type: "error", text: t("backup.passwordRequired") });
      return;
    }
    setBusy("export");
    setMessage(null);
    try {
      const response = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ passphrase }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? t("backup.exportFailed"));
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `3dpcc-backup-${new Date().toISOString().slice(0, 10)}.3dpcc`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage({ type: "success", text: t("backup.exported") });
    } catch (error) {
      console.error("Could not export backup:", error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : t("backup.exportFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    if (!file) {
      setMessage({ type: "error", text: t("backup.fileRequired") });
      return;
    }
    if (passphrase.length < 12) {
      setMessage({ type: "error", text: t("backup.passwordRequired") });
      return;
    }
    if (!window.confirm(t("backup.confirmRestore"))) return;
    setBusy("restore");
    setMessage(null);
    try {
      const response = await fetch("/api/backup", {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-3D-PCC-Backup-Password": passphrase,
        },
        cache: "no-store",
        body: file,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("backup.restoreFailed"));
      setMessage({ type: "success", text: t("backup.restored") });
      window.setTimeout(() => router.push("/settings"), 1500);
    } catch (error) {
      console.error("Could not restore backup:", error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : t("backup.restoreFailed") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("backup.title")}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("backup.description")}</p>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("backup.passwordHint")}</p>

      <label className="mt-4 block text-sm font-medium text-slate-600 dark:text-slate-300">
        {t("backup.password")}
        <input className={inputClass} type="password" autoComplete="new-password" minLength={12} maxLength={256}
          value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void exportBackup()} disabled={busy !== null}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
          {busy === "export" ? t("backup.exporting") : t("backup.export")}
        </button>
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700">
        <h3 className="font-medium">{t("backup.restoreTitle")}</h3>
        <label className="mt-3 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t("backup.file")}
          <input className={inputClass} type="file" accept=".3dpcc,application/octet-stream"
            onChange={chooseFile} />
        </label>
        <button type="button" onClick={() => void restore()} disabled={busy !== null}
          className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30">
          {busy === "restore" ? t("backup.restoring") : t("backup.restore")}
        </button>
      </div>

      {message && (
        <p role={message.type === "error" ? "alert" : "status"} className={`mt-3 text-sm ${
          message.type === "error" ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"
        }`}>{message.text}</p>
      )}
    </section>
  );
}
