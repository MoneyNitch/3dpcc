"use client";

import { useState } from "react";
import type { DbConfigView, DbDriver } from "@/lib/dbConfig";
import { useLocale } from "@/lib/locale";

export function DatabaseSettingsForm({ initialConfig }: { initialConfig: DbConfigView }) {
  const { t } = useLocale();
  const [driver, setDriver] = useState<DbDriver>(initialConfig.driver);
  const [host, setHost] = useState(initialConfig.host);
  const [port, setPort] = useState(initialConfig.port);
  const [database, setDatabase] = useState(initialConfig.database);
  const [user, setUser] = useState(initialConfig.user);
  // The real password is never sent from the server — this stays empty unless the
  // user actively types a new one, so nobody can just look at it in this form.
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(initialConfig.hasPassword);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedConnection, setSavedConnection] = useState(JSON.stringify({
    driver: initialConfig.driver,
    host: initialConfig.host,
    port: initialConfig.port,
    database: initialConfig.database,
    user: initialConfig.user,
  }));

  const textInputClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

  async function save() {
    setStatus("saving");
    setError(null);
    const connection = JSON.stringify({ driver, host, port, database, user });
    const transferData =
      savedConnection !== connection &&
      window.confirm(t("db.transferConfirm"));
    const res = await fetch("/api/db-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driver,
        host,
        port,
        database,
        user,
        password: password || undefined,
        transferData,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setStatus("error");
      setError(`${t("db.connectionFailed")}: ${body.error ?? t("db.saveFailed")}`);
      return;
    }
    if (password) setHasPassword(true);
    setPassword("");
    setSavedConnection(connection);
    setStatus("saved");
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("db.title")}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("db.description")}</p>

      <label className="mt-4 block text-sm font-medium text-slate-600 dark:text-slate-300">
        {t("db.driver")}
        <select
          value={driver}
          onChange={(e) => setDriver(e.target.value as DbDriver)}
          className={textInputClass}
        >
          <option value="sqlite">{t("db.driverSqlite")}</option>
          <option value="postgres">{t("db.driverPostgres")}</option>
          <option value="mysql">{t("db.driverMysql")}</option>
        </select>
      </label>

      {driver !== "sqlite" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {t("db.host")}
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="localhost"
              className={textInputClass}
            />
          </label>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {t("db.port")}
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value, 10) || 0)}
              className={textInputClass}
            />
          </label>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {t("db.database")}
            <input
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              placeholder="3dpcc"
              className={textInputClass}
            />
          </label>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {t("db.user")}
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="off"
              className={textInputClass}
            />
          </label>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">
            {t("db.password")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder={hasPassword ? t("db.passwordKeepPlaceholder") : t("db.passwordPlaceholder")}
              className={textInputClass}
            />
            <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
              {t("db.passwordNote")}
            </span>
          </label>
        </div>
      )}

      {error && <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

      <button
        onClick={save}
        disabled={status === "saving"}
        className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {status === "saving" ? t("db.testing") : status === "saved" ? t("db.saved") : t("db.save")}
      </button>
    </section>
  );
}
