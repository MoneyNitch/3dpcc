"use client";

import { useState } from "react";
import { useLocale } from "@/lib/locale";
import { FILAMENT_PROVIDERS, type FilamentConnectionsView, type FilamentProvider } from "@/lib/externalFilaments";

export function FilamentConnectionSettings({ initialConnections }: { initialConnections: FilamentConnectionsView }) {
  const { t } = useLocale();
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("filamentDb.title")}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("filamentDb.description")}</p>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        {FILAMENT_PROVIDERS.map((provider) => (
          <ConnectionForm key={provider} provider={provider} initialConnection={initialConnections[provider]} />
        ))}
      </div>
    </section>
  );
}

function ConnectionForm({ provider, initialConnection }: {
  provider: FilamentProvider;
  initialConnection: FilamentConnectionsView[FilamentProvider];
}) {
  const { t } = useLocale();
  const [url, setUrl] = useState(initialConnection.url);
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(initialConnection.hasApiKey);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
  function changed() { setStatus("idle"); setError(""); }

  async function save() {
    setStatus("saving");
    setError("");
    try {
      const response = await fetch("/api/filament-connections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, url, apiKey, clearApiKey }),
      });
      const body = await response.json();
      if (!response.ok) {
        const code = ["input", "url", "auth", "connection", "response", "limit", "config"].includes(body.error)
          ? body.error : "connection";
        setError(t(`filamentDb.error.${code}`));
        setStatus("error");
        return;
      }
      const connection = (body.connections as FilamentConnectionsView)[provider];
      setUrl(connection.url);
      setHasApiKey(connection.hasApiKey);
      setApiKey("");
      setClearApiKey(false);
      setStatus("saved");
    } catch {
      setError(t("filamentDb.error.connection"));
      setStatus("error");
    }
  }

  return (
    <fieldset disabled={status === "saving"} className="min-w-0 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <legend className="px-1 font-medium dark:text-slate-100">{provider === "spoolman" ? "Spoolman" : "FilaMan"}</legend>
      <label className="block text-sm text-slate-600 dark:text-slate-300">
        {t("filamentDb.url")}
        <input type="url" value={url} onChange={(event) => { setUrl(event.target.value); changed(); }}
          placeholder={provider === "spoolman" ? "http://spoolman:7912" : "http://filaman:8083"}
          className={inputClass} />
      </label>
      <label className="mt-3 block text-sm text-slate-600 dark:text-slate-300">
        {t("filamentDb.apiKey")}
        <input type="password" value={apiKey} autoComplete="new-password"
          onChange={(event) => { setApiKey(event.target.value); setClearApiKey(false); changed(); }}
          placeholder={hasApiKey ? t("filamentDb.keepKey") : t("filamentDb.keyPlaceholder")}
          className={inputClass} />
      </label>
      {hasApiKey && (
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <input type="checkbox" checked={clearApiKey}
            onChange={(event) => { setClearApiKey(event.target.checked); setApiKey(""); changed(); }} />
          {t("filamentDb.clearKey")}
        </label>
      )}
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t(`filamentDb.${provider}Help`)}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("filamentDb.keyHelp")}</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {status === "saved" && <p role="status" className="mt-3 text-sm text-green-700 dark:text-green-400">{t("filamentDb.saved")}</p>}
      <button type="button" onClick={() => void save()}
        className="mt-3 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
        {status === "saving" ? t("filamentDb.testing") : t("filamentDb.save")}
      </button>
    </fieldset>
  );
}
