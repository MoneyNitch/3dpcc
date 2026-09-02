"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale } from "@/lib/locale";

export function PrintNameEditor({ id, initialName }: { id: string; initialName: string }) {
  const router = useRouter();
  const { t } = useLocale();
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);

  async function save() {
    const displayName = name.trim();
    if (!displayName) return;
    const response = await fetch(`/api/prints/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName }) });
    if (response.ok) { setEditing(false); router.refresh(); }
  }

  if (!editing) return <button type="button" onClick={() => setEditing(true)} title={t("print.customName")} className="block text-left text-xl font-semibold text-slate-900 hover:text-orange-600 dark:text-slate-100">{name}</button>;
  return <input autoFocus value={name} maxLength={200} aria-label={t("print.customName")} onChange={(event) => setName(event.target.value)} onBlur={() => void save()} onKeyDown={(event) => { if (event.key === "Enter") void save(); if (event.key === "Escape") { setName(initialName); setEditing(false); } }} className="w-full max-w-lg rounded-lg border border-orange-400 bg-white px-3 py-1.5 text-xl font-semibold dark:bg-slate-900 dark:text-slate-100" />;
}
