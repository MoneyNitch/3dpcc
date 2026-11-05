"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/locale";
import type { Identity } from "@/lib/auth/permissions";
import { defaultPasswordPolicy, passwordPolicyError, type PasswordPolicy } from "@/lib/auth/passwordPolicy";
import { PasswordRequirements } from "./PasswordRequirements";

type Field = "username" | "oldPassword" | "password" | "confirmation";
const fieldForError: Record<string, Field> = {
  usernameUnchanged: "username", usernameTaken: "username", invalidLogin: "oldPassword",
  passwordUnchanged: "password", passwordTooShort: "password", passwordMismatch: "confirmation",
  passwordTooLong: "password", passwordReserved: "password", passwordUppercase: "password",
  passwordLowercase: "password", passwordNumber: "password", passwordSpecial: "password",
};

export function AuthForm({ user, passwordPolicy = defaultPasswordPolicy }: { user?: Identity; passwordPolicy?: PasswordPolicy }) {
  const { t } = useLocale();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const errorField = fieldForError[error] as Field | undefined;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    // Read from the DOM so browser/password-manager autofill without input events is still submitted.
    const form = new FormData(event.currentTarget);
    const value = (name: Field) => String(form.get(name) ?? "");
    const username = value("username").trim();
    const password = value("password");
    if (user) {
      const oldPassword = value("oldPassword");
      const localError = user.mustChangeUsername && username.toLowerCase() === "admin" ? "usernameUnchanged"
        : passwordPolicyError(password, passwordPolicy) ?? (
          password === oldPassword ? "passwordUnchanged"
          : password !== value("confirmation") ? "passwordMismatch" : "");
      if (localError) { setError(localError); return; }
      await send({ action: "change", username, oldPassword, password });
    } else await send({ action: "login", username, password, rememberMe: form.get("rememberMe") === "on" });
  }
  async function send(payload: Record<string, string | boolean>) {
    setBusy(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(typeof body.error === "string" ? body.error : "serverError"); return; }
      router.replace(body.redirect);
      router.refresh();
    } catch (error) {
      console.error("Authentication request failed:", error);
      setError("serverError");
    } finally { setBusy(false); }
  }
  const inputClass = (field: Field) => `w-full rounded-lg border bg-white px-3 py-2 dark:bg-slate-950 ${errorField === field
    ? "border-red-500 dark:border-red-500" : "border-slate-300 dark:border-slate-700"}`;
  const passwordType = showPasswords ? "text" : "password";
  const invalid = (field: Field) => errorField === field || undefined;
  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h1 className="text-2xl font-semibold">{t(user ? "auth.account" : "auth.login")}</h1>
      {user && <p className="text-sm text-slate-500 dark:text-slate-400">{t(user.mustChangeUsername ? "auth.bootstrap" : user.mustChangePassword ? "auth.passwordRequired" : "auth.changeHelp")}</p>}
      <label className="text-sm">{t(user?.mustChangeUsername ? "auth.newUsernameHint" : "auth.username")}
        <input id="auth-username" name="username" className={inputClass("username")} aria-invalid={invalid("username")}
          defaultValue={user && !user.mustChangeUsername ? user.username : ""} required minLength={3} maxLength={64}
          pattern="[a-zA-Z0-9_.\-]+" autoComplete="username" autoCapitalize="none" spellCheck={false} />
      </label>
      {user && <label className="text-sm">{t("auth.oldPassword")}
        <input id="auth-old-password" name="oldPassword" className={inputClass("oldPassword")} aria-invalid={invalid("oldPassword")}
          type={passwordType} required maxLength={128} autoComplete="current-password" />
      </label>}
      <label className="text-sm">{t(user ? "auth.newPassword" : "auth.password")}
        <input id="auth-password" name="password" className={inputClass("password")} aria-invalid={invalid("password")}
          type={passwordType} required minLength={user ? passwordPolicy.minLength : 1} maxLength={128} autoComplete={user ? "new-password" : "current-password"} />
      </label>
      {!user && <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="rememberMe" />
        {t("auth.rememberMe")}
      </label>}
      {user && <PasswordRequirements policy={passwordPolicy} />}
      {user && <label className="text-sm">{t("auth.confirmPassword")}
        <input id="auth-confirmation" name="confirmation" className={inputClass("confirmation")} aria-invalid={invalid("confirmation")}
          type={passwordType} required minLength={passwordPolicy.minLength} maxLength={128} autoComplete="new-password" />
      </label>}
      {user && <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} />
        {t("auth.showPasswords")}
      </label>}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t(`auth.error.${error}`)}</p>}
      <button disabled={busy} className="rounded-lg bg-orange-600 px-4 py-2 text-white disabled:opacity-50">{t(busy ? "auth.working" : user ? "auth.saveCredentials" : "auth.login")}</button>
    </form>
  );
}
