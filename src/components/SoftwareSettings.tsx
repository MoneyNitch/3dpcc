"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePermission } from "@/lib/auth/context";
import { useLocale } from "@/lib/locale";
import type { GithubPreferences, SoftwareInfo } from "@/lib/softwareUpdates";
import { Changelog } from "@/components/Changelog";
import { useSoftwareUpdate } from "@/lib/softwareUpdateContext";

export function selectGithubPreferences(preferences: GithubPreferences): GithubPreferences {
  return {
    fetchGithubChangelog: preferences.fetchGithubChangelog,
    checkGithubUpdates: preferences.checkGithubUpdates,
  };
}

export function SoftwareSettings({ initialPreferences, onPreferencesSaved, onInfo }: {
  initialPreferences: GithubPreferences;
  onPreferencesSaved: (preferences: GithubPreferences) => void;
  onInfo: (info: SoftwareInfo | null) => void;
}) {
  const { t, lang } = useLocale();
  const canEdit = usePermission("settings.write");
  const { setUpdate } = useSoftwareUpdate();
  const [preferences, setPreferences] = useState(() => selectGithubPreferences(initialPreferences));
  const [info, setInfo] = useState<SoftwareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"load" | "save" | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async (refresh = false) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/software-updates", {
        method: refresh ? "POST" : "GET", cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Software information request failed (${response.status}).`);
      const body: SoftwareInfo = await response.json();
      if (!controller.signal.aborted) {
        setInfo(body);
        onInfo(body);
        setUpdate(body.update);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error("Could not load software information:", error);
        setError("load");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [onInfo, setUpdate]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => {
      active = false;
      activeRequest.current?.abort();
    };
  }, [load]);

  async function savePreference(field: keyof GithubPreferences, value: boolean) {
    if (saving) return;
    activeRequest.current?.abort();
    setLoading(false);
    setSaving(true);
    setError(null);
    const updated = { ...preferences, [field]: value };
    try {
      const response = await fetch("/api/software-updates", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated),
      });
      if (!response.ok) throw new Error(`GitHub preference save failed (${response.status}).`);
      setPreferences(updated);
      onPreferencesSaved(updated);
      setUpdate(updated.checkGithubUpdates ? null : { status: "disabled" });
      setInfo(null);
      onInfo(null);
      await load();
    } catch (error) {
      console.error("Could not save GitHub preferences:", error);
      setError("save");
    } finally {
      setSaving(false);
    }
  }

  const checkedAt = info?.update.checkedAt;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("software.title")}</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t("software.privacy")}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(["fetchGithubChangelog", "checkGithubUpdates"] as const).map((field) => (
          <label key={field} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
            <input type="checkbox" className="mt-1 accent-orange-500" checked={preferences[field]}
              disabled={!canEdit || saving} onChange={(event) => void savePreference(field, event.target.checked)} />
            <span>
              <span className="block font-medium text-slate-800 dark:text-slate-100">{t(`software.${field}`)}</span>
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{t(`software.${field}Help`)}</span>
            </span>
          </label>
        ))}
      </div>
      {!preferences.fetchGithubChangelog && !preferences.checkGithubUpdates && (
        <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">{t("software.offline")}</p>
      )}
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("software.savedImmediately")}</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{t(`software.error.${error}`)}</p>}
      <div className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{t("software.updates")}</h3>
          <button type="button" disabled={loading || saving || (!preferences.fetchGithubChangelog && !preferences.checkGithubUpdates)}
            onClick={() => void load(true)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200">
            {loading ? t("software.loading") : t("software.refresh")}
          </button>
        </div>
        {info && <div className="mt-3 text-sm">
          <p className="text-slate-600 dark:text-slate-300">{t("settings.version")}: {info.installedVersion}</p>
          <p role={info.update.status === "error" ? "alert" : "status"}
            className={`mt-2 ${info.update.status === "available" ? "font-semibold text-orange-700 dark:text-orange-300" : "text-slate-600 dark:text-slate-300"}`}>
            {t(`software.update.${info.update.status}`, { version: info.update.version ?? "" })}
          </p>
          {info.update.status === "error" && <p className="mt-1 text-red-600 dark:text-red-400">{t(`software.githubError.${info.update.error ?? "response"}`)}</p>}
          {info.update.status === "available" && info.update.url && <a href={info.update.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
            className="mt-2 inline-block text-orange-700 underline dark:text-orange-300">{t("software.openRelease")}</a>}
          {checkedAt && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("software.checkedAt")}: {new Date(checkedAt).toLocaleString(lang)}</p>}
        </div>}
      </div>
      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{t("software.changelog")}</h3>
          {info && <span className="text-xs text-slate-500 dark:text-slate-400">{t(`software.source.${info.changelog.source}`)}</span>}
        </div>
        {info?.changelog.error && <p role="alert" className="mt-2 text-sm text-amber-700 dark:text-amber-300">
          {t("software.changelogFallback")} {t(`software.githubError.${info.changelog.error}`)}
        </p>}
        {info?.changelog.text && <Changelog text={info.changelog.text} />}
      </div>
    </section>
  );
}
