"use client";

import { useState } from "react";
import type { DbConfigView, DbDriver } from "@/lib/dbConfig";

export function DatabaseSettingsForm({ initialConfig }: { initialConfig: DbConfigView }) {
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

  const textInputClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

  async function save() {
    setStatus("saving");
    setError(null);
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
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setStatus("error");
      setError(body.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    if (password) setHasPassword(true);
    setPassword("");
    setStatus("saved");
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Datenbank</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Standardmäßig wird eine lokale SQLite-Datei verwendet. Optional kann hier
        stattdessen eine PostgreSQL- oder MariaDB/MySQL-Datenbank angebunden werden.
      </p>

      <label className="mt-4 block text-sm font-medium text-slate-600 dark:text-slate-300">
        Treiber
        <select
          value={driver}
          onChange={(e) => setDriver(e.target.value as DbDriver)}
          className={textInputClass}
        >
          <option value="sqlite">SQLite (lokal)</option>
          <option value="postgres">PostgreSQL</option>
          <option value="mysql">MySQL / MariaDB</option>
        </select>
      </label>

      {driver !== "sqlite" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Host
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="localhost"
              className={textInputClass}
            />
          </label>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Port
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value, 10) || 0)}
              className={textInputClass}
            />
          </label>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Datenbankname
            <input
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              placeholder="3dpcc"
              className={textInputClass}
            />
          </label>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Benutzername
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="off"
              className={textInputClass}
            />
          </label>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">
            Passwort
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder={hasPassword ? "•••••••• (unverändert lassen)" : "Passwort eingeben"}
              className={textInputClass}
            />
            <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
              Aus Sicherheitsgründen wird das gespeicherte Passwort nie angezeigt oder
              vorausgefüllt — leer lassen, um es unverändert zu behalten.
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
        {status === "saving"
          ? "Verbindung wird geprüft…"
          : status === "saved"
            ? "Gespeichert ✓"
            : "Datenbank speichern"}
      </button>
    </section>
  );
}
