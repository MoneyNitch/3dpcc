"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/locale";
import type { PreviewQueueEntry } from "@/lib/types";

interface QueueView {
  paused: boolean;
  jobs: (PreviewQueueEntry & { name: string })[];
}

export function PreviewQueueSettings() {
  const { t } = useLocale();
  const [view, setView] = useState<QueueView | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch("/api/preview-queue", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`Queue request failed (${response.status}).`);
        const data: QueueView = await response.json();
        if (!controller.signal.aborted) setView(data);
      } catch (failure) {
        if (controller.signal.aborted) return;
        console.error("Failed to load preview queue:", failure);
        setError(true);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), 3000);
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [version]);

  async function change(id: string, direction?: "up" | "down") {
    if (!direction && !window.confirm(t("queue.removeConfirm"))) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/preview-queue", {
        method: direction ? "PATCH" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, direction }),
      });
      if (!response.ok) throw new Error(`Queue update failed (${response.status}).`);
    } catch (failure) {
      console.error("Failed to update preview queue:", failure);
      setError(true);
    } finally {
      setBusy(false);
      setVersion((value) => value + 1);
    }
  }

  const waiting = view?.jobs.filter((job) => job.status === "queued") ?? [];
  const buttonClass = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-600";
  return (
    <section id="queue-settings-panel" role="tabpanel" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("queue.title")}</h2>
        <button type="button" disabled={busy} onClick={() => { setError(false); setVersion((value) => value + 1); }} className={buttonClass}>{t("queue.refresh")}</button>
      </div>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("queue.help")}</p>
      {view?.paused && <p role="status" className="mt-3 text-sm text-orange-600 dark:text-orange-400">{t("queue.paused")}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{t("queue.error")}</p>}
      {!view && !error && <p role="status" className="mt-4 text-sm">{t("queue.loading")}</p>}
      {view?.jobs.length === 0 && <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t("queue.empty")}</p>}
      <ol className="mt-4 flex flex-col gap-3">
        {view?.jobs.map((job) => {
          const index = waiting.findIndex((item) => item.id === job.id);
          return (
            <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="min-w-0">
                <Link href={`/prints/${job.id}`} className="break-words font-medium text-orange-600 hover:underline dark:text-orange-400">{job.name}</Link>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {job.status === "queued" ? `${index + 1}. ` : ""}{t(job.status === "error" ? "queue.errorStatus" : `queue.${job.status}`)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {job.status === "queued" && <>
                  <button type="button" disabled={busy || index === 0} onClick={() => void change(job.id, "up")} aria-label={`${t("queue.up")}: ${job.name}`} className={buttonClass}>{t("queue.up")}</button>
                  <button type="button" disabled={busy || index === waiting.length - 1} onClick={() => void change(job.id, "down")} aria-label={`${t("queue.down")}: ${job.name}`} className={buttonClass}>{t("queue.down")}</button>
                </>}
                <button type="button" disabled={busy} onClick={() => void change(job.id)} aria-label={`${t(job.status === "running" ? "queue.cancel" : "queue.remove")}: ${job.name}`} className={`${buttonClass} text-red-600 dark:text-red-400`}>
                  {t(job.status === "running" ? "queue.cancel" : "queue.remove")}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
