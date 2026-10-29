"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/locale";

type BrowserError = {
  timestamp: string;
  type: "error" | "unhandledrejection";
  message: string;
  stack: string;
  page: string;
};

const MAX_ERRORS = 50;

function describeError(reason: unknown) {
  if (reason instanceof Error) {
    return { message: reason.message || reason.name, stack: reason.stack ?? "" };
  }
  if (typeof reason === "string") return { message: reason, stack: "" };
  return { message: "Unhandled rejection with a non-string value", stack: "" };
}

export function SupportExport() {
  const { t } = useLocale();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [includeErrors, setIncludeErrors] = useState(false);
  const [errors, setErrors] = useState<BrowserError[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    function recordError(type: BrowserError["type"], reason: unknown) {
      const { message, stack } = describeError(reason);
      setErrors((current) => [
        ...current,
        {
          timestamp: new Date().toISOString(),
          type,
          message: message.slice(0, 2000),
          stack: stack.slice(0, 5000),
          page: window.location.pathname,
        },
      ].slice(-MAX_ERRORS));
    }

    function onError(event: ErrorEvent) {
      recordError("error", event.error instanceof Error ? event.error : event.message);
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      recordError("unhandledrejection", event.reason);
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  async function downloadReport() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/support-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          browser: {
            userAgent: navigator.userAgent,
            language: navigator.language,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            screen: { width: screen.width, height: screen.height },
            online: navigator.onLine,
            page: window.location.pathname,
          },
          issue: {
            title: title.trim(),
            description: description.trim(),
            reproductionSteps: steps.trim(),
          },
          errors: includeErrors ? errors : [],
        }),
      });
      if (!response.ok) throw new Error(`Support report request failed (${response.status}).`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `3dpcc-support-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage({ type: "success", text: t("support.exported") });
    } catch (error) {
      console.error("Could not export support report:", error);
      setMessage({ type: "error", text: t("support.exportFailed") });
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("support.title")}</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t("support.description")}</p>
      <p className="mt-2 rounded-lg bg-slate-100 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
        {t("support.privacy")}
      </p>
      <label className="mt-4 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={includeErrors}
          onChange={(event) => setIncludeErrors(event.target.checked)}
          className="mt-1"
        />
        <span>{t("support.includeErrors", { count: errors.length })}</span>
      </label>
      {includeErrors && (
        <details className="mt-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
          <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-200">
            {t("support.reviewErrors")}
          </summary>
          {errors.length === 0 ? (
            <p className="mt-2 text-slate-500 dark:text-slate-400">{t("support.noErrors")}</p>
          ) : (
            <ul className="mt-2 max-h-64 space-y-3 overflow-auto">
              {errors.map((error, index) => (
                <li key={`${error.timestamp}-${index}`} className="border-t border-slate-200 pt-2 dark:border-slate-700">
                  <p className="font-medium">{error.type} · {new Date(error.timestamp).toLocaleString()}</p>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">{error.message}{error.stack ? `\n${error.stack}` : ""}</pre>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
      <div className="mt-4 grid gap-4">
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {t("support.issueTitle")}
          <input
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {t("support.issueDescription")}
          <textarea
            value={description}
            maxLength={5000}
            rows={4}
            onChange={(event) => setDescription(event.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {t("support.reproductionSteps")}
          <textarea
            value={steps}
            maxLength={5000}
            rows={4}
            onChange={(event) => setSteps(event.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={downloadReport}
        disabled={busy}
        className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? t("support.exporting") : t("support.export")}
      </button>
      {message && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={`mt-3 text-sm ${
            message.type === "error"
              ? "text-red-600 dark:text-red-400"
              : "text-green-700 dark:text-green-400"
          }`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
