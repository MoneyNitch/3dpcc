"use client";

import { useState } from "react";
import { useLocale } from "@/lib/locale";
import { permissions, type AuthUser, type Permission, type Role } from "@/lib/auth/permissions";
import type { ApiKeyView } from "@/lib/auth/store";
import { passwordCharacterRules, passwordPolicyError, type PasswordPolicy } from "@/lib/auth/passwordPolicy";
import { PasswordRequirements } from "./PasswordRequirements";

interface Overview { users: AuthUser[]; roles: Role[]; keys: ApiKeyView[]; passwordPolicy: PasswordPolicy }
const inputClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
const buttonClass = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700";
const sectionClass = "min-w-0 rounded-lg border border-slate-200 p-4 dark:border-slate-700";
const primaryButtonClass = "rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50";

export function UserManagement({ initial, actorId }: { initial: Overview; actorId: string }) {
  const { t } = useLocale();
  const [overview, setOverview] = useState(initial);
  const [policyDraft, setPolicyDraft] = useState(initial.passwordPolicy);
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [userId, setUserId] = useState<string>();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("viewer");
  const [active, setActive] = useState(true);
  const [roleFormOpen, setRoleFormOpen] = useState(false);
  const [customId, setCustomId] = useState<string>();
  const [roleName, setRoleName] = useState("");
  const [grants, setGrants] = useState<Permission[]>([]);
  const [keyUserId, setKeyUserId] = useState(initial.users.find((user) => !user.mustChangePassword)?.id ?? "");
  const [keyName, setKeyName] = useState("");
  const [keyFormOpen, setKeyFormOpen] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(input: object): Promise<boolean> {
    setBusy(true); setError(""); setMessage(""); setToken("");
    try {
      const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const body = await response.json();
      if (!response.ok) { setError(t(`auth.error.${body.error}`)); return false; }
      if (body.token) setToken(body.token);
      const refreshed = await fetch("/api/users", { cache: "no-store" });
      if (!refreshed.ok) throw new Error(`Reload failed (${refreshed.status}).`);
      setOverview(await refreshed.json());
      setMessage(t("auth.saved"));
      return true;
    } catch (error) {
      console.error("User management request failed:", error);
      setError(t("auth.error.serverError"));
      return false;
    } finally { setBusy(false); }
  }
  function resetUser() { setUserId(undefined); setUsername(""); setPassword(""); setRoleId("viewer"); setActive(true); setUserFormOpen(false); }
  function editUser(user: AuthUser) { setUserId(user.id); setUsername(user.username); setRoleId(user.roleId); setActive(user.active); setPassword(""); setUserFormOpen(true); }
  function resetRole() { setCustomId(undefined); setRoleName(""); setGrants([]); setRoleFormOpen(false); }
  function editRole(role: Role) { setCustomId(role.id); setRoleName(role.name); setGrants(role.permissions); setRoleFormOpen(true); }
  async function saveUser(event: React.FormEvent) {
    event.preventDefault();
    const policyError = password ? passwordPolicyError(password, overview.passwordPolicy) : undefined;
    if (policyError) { setError(t(`auth.error.${policyError}`)); setMessage(""); return; }
    if (await send({ action: "saveUser", id: userId, data: { username, roleId, active, ...(password ? { password } : {}) } })) resetUser();
  }
  async function saveRole(event: React.FormEvent) {
    event.preventDefault();
    if (await send({ action: "saveRole", id: customId, data: { name: roleName, permissions: grants } })) resetRole();
  }
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <header className="mb-5">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("auth.users")}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("auth.rolesHelp")}</p>
      </header>
      <div className="flex flex-col gap-5">
        {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
        {message && <p role="status" className="text-sm font-medium text-green-700 dark:text-green-400">{message}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: t("auth.users"), value: overview.users.length },
            { label: t("auth.activeUsers"), value: overview.users.filter((user) => user.active).length },
            { label: t("auth.apiKeys"), value: overview.keys.length },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
              <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-800 dark:text-slate-100">{stat.value}</p>
            </div>
          ))}
        </div>
        <fieldset disabled={busy} className={sectionClass}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">{t("auth.users")}</h3>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{overview.users.length}</p>
            </div>
            <button type="button" className={primaryButtonClass} onClick={() => { resetUser(); setUserFormOpen(true); }}>{t("auth.newUser")}</button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {overview.users.map((user) => <article key={user.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 font-semibold text-orange-700 dark:bg-orange-950 dark:text-orange-300">{user.username.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800 dark:text-slate-100">{user.username}{user.id === actorId && <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">({t("auth.you")})</span>}</p>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{overview.roles.find((role) => role.id === user.roleId)?.name ?? user.roleId}</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${user.active ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>{t(user.active ? "auth.active" : "auth.inactive")}</span>
              </div>
              {user.mustChangePassword && <p className="mt-3 rounded-md bg-orange-50 px-2.5 py-1.5 text-xs font-medium text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">{t("auth.changePending")}</p>}
              {user.id !== actorId && <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                <button type="button" className={buttonClass} onClick={() => editUser(user)}>{t("auth.edit")}</button>
                <button type="button" className={`${buttonClass} text-red-600 dark:text-red-400`} onClick={() => { if (window.confirm(t("auth.confirmDelete"))) void send({ action: "deleteUser", id: user.id }); }}>{t("auth.delete")}</button>
              </div>}
            </article>)}
          </div>
          {userFormOpen && <form onSubmit={saveUser} className="mt-4 grid gap-3 rounded-lg border border-orange-200 bg-orange-50/50 p-4 sm:grid-cols-2 dark:border-orange-900 dark:bg-orange-950/20">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 sm:col-span-2">{t(userId ? "auth.editUser" : "auth.newUser")}</h3>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">{t("auth.username")}<input className={inputClass} value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={64} autoComplete="off" /></label>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">{t(userId ? "auth.resetPassword" : "auth.password")}<input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required={!userId} minLength={overview.passwordPolicy.minLength} maxLength={128} autoComplete="new-password" /></label>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">{t("auth.role")}<select className={inputClass} value={roleId} onChange={(event) => setRoleId(event.target.value)}>{overview.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />{t("auth.active")}</label>
            <p className="text-sm text-slate-500 dark:text-slate-400 sm:col-span-2">{t("auth.userPasswordHelp")}</p>
            <div className="sm:col-span-2"><PasswordRequirements policy={overview.passwordPolicy} /></div>
            <div className="flex gap-2"><button className={primaryButtonClass} type="submit">{t("auth.save")}</button><button className={buttonClass} type="button" onClick={resetUser}>{t("auth.cancel")}</button></div>
          </form>}
        </fieldset>
        <fieldset disabled={busy} className={sectionClass}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{t("auth.policy.title")}</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("auth.policy.help")}</p>
          <form className="mt-4 flex flex-col gap-4" onSubmit={(event) => {
            event.preventDefault();
            void send({ action: "savePasswordPolicy", data: policyDraft });
          }}>
            <label className="max-w-xs text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("auth.policy.minLength")}
              <input type="number" min={4} max={128} step={1} required value={policyDraft.minLength}
                onChange={(event) => setPolicyDraft((policy) => ({ ...policy, minLength: Number(event.target.value) }))}
                className={inputClass} />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {passwordCharacterRules.map((rule) => (
                <label key={rule.key} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={policyDraft[rule.key]}
                    onChange={(event) => setPolicyDraft((policy) => ({ ...policy, [rule.key]: event.target.checked }))} />
                  {t(`auth.policy.${rule.key}`)}
                </label>
              ))}
            </div>
            {policyDraft.minLength < 12 && <p className="text-sm text-orange-700 dark:text-orange-300">{t("auth.policy.weakWarning")}</p>}
            <button type="submit" className={`${primaryButtonClass} self-start`}>{t("auth.policy.save")}</button>
          </form>
        </fieldset>
        <fieldset disabled={busy} className={sectionClass}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">{t("auth.customRoles")}</h3>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{overview.roles.length}</p>
            </div>
            <button type="button" className={buttonClass} onClick={() => { resetRole(); setRoleFormOpen(true); }}>{t("auth.createRole")}</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {overview.roles.map((role) => <div key={role.id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/50">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800 dark:text-slate-100">{role.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{role.permissions.length} {t("auth.permissionCount")}</p>
              </div>
              {!role.builtIn && <div className="flex shrink-0 gap-1">
                <button type="button" className={buttonClass} onClick={() => editRole(role)}>{t("auth.edit")}</button>
                <button type="button" className={`${buttonClass} text-red-600 dark:text-red-400`} onClick={() => { if (window.confirm(t("auth.confirmDelete"))) void send({ action: "deleteRole", id: role.id }); }}>{t("auth.delete")}</button>
              </div>}
            </div>)}
          </div>
          {roleFormOpen && <form onSubmit={saveRole} className="mt-4 flex flex-col gap-3 rounded-lg border border-orange-200 bg-orange-50/50 p-4 dark:border-orange-900 dark:bg-orange-950/20">
            <h4 className="font-semibold text-slate-800 dark:text-slate-100">{t(customId ? "auth.editRole" : "auth.createRole")}</h4>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">{t("auth.roleName")}<input className={inputClass} value={roleName} onChange={(event) => setRoleName(event.target.value)} required maxLength={64} /></label>
            <div className="grid gap-2 sm:grid-cols-2">{permissions.map((permission) => <label key={permission} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><input className="mt-0.5" type="checkbox" checked={grants.includes(permission)} onChange={(event) => setGrants((current) => event.target.checked ? [...current, permission] : current.filter((value) => value !== permission))} />{t(`auth.permission.${permission}`)}</label>)}</div>
            <div className="flex gap-2"><button className={primaryButtonClass} type="submit">{t("auth.saveRole")}</button><button className={buttonClass} type="button" onClick={resetRole}>{t("auth.cancel")}</button></div>
          </form>}
        </fieldset>
        <fieldset disabled={busy} className={sectionClass}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">{t("auth.apiKeys")}</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("auth.apiHelp")}</p>
            </div>
            <button type="button" className={buttonClass} onClick={() => setKeyFormOpen((open) => !open)}>{t(keyFormOpen ? "auth.cancel" : "auth.createKey")}</button>
          </div>
          {token && <div role="status" className="my-3 rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm dark:border-orange-800 dark:bg-orange-950/30"><p>{t("auth.keyOnce")}</p><code className="my-2 block select-all break-all">{token}</code><button type="button" className={buttonClass} onClick={() => setToken("")}>{t("auth.dismissKey")}</button></div>}
          {overview.keys.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 px-3 py-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">{t("auth.noApiKeys")}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {overview.keys.map((key) => (
              <div key={key.id} className="flex min-w-0 flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/50">
                <div className="min-w-0">
                  <p className="break-all text-sm font-medium text-slate-800 dark:text-slate-100">{key.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{overview.users.find((user) => user.id === key.userId)?.username}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={buttonClass} onClick={() => {
                    if (window.confirm(t("auth.confirmRegenerateKey", { name: key.name }))) void send({ action: "regenerateKey", id: key.id });
                  }}>{t("auth.regenerateKey")}</button>
                  <button type="button" className={`${buttonClass} text-red-600 dark:text-red-400`} onClick={() => {
                    if (window.confirm(t("auth.confirmDelete"))) void send({ action: "revokeKey", id: key.id });
                  }}>{t("auth.revoke")}</button>
                </div>
              </div>
            ))}
          </div>
          {keyFormOpen && <form className="mt-4 grid gap-3 rounded-lg border border-orange-200 bg-orange-50/50 p-4 sm:grid-cols-2 dark:border-orange-900 dark:bg-orange-950/20" onSubmit={async (event) => { event.preventDefault(); if (await send({ action: "createKey", userId: keyUserId, name: keyName })) { setKeyFormOpen(false); setKeyName(""); } }}>
            <h4 className="font-semibold text-slate-800 dark:text-slate-100 sm:col-span-2">{t("auth.createKey")}</h4>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">{t("auth.username")}<select className={inputClass} required value={keyUserId} onChange={(event) => setKeyUserId(event.target.value)}><option value="">{t("auth.chooseUser")}</option>{overview.users.filter((user) => user.active && !user.mustChangePassword && !user.mustChangeUsername && overview.roles.find((role) => role.id === user.roleId)?.permissions.includes("api.use")).map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">{t("auth.keyName")}<input className={inputClass} value={keyName} onChange={(event) => setKeyName(event.target.value)} required maxLength={64} /></label>
            <button type="submit" className={`${primaryButtonClass} self-start`}>{t("auth.createKey")}</button>
          </form>}
        </fieldset>
      </div>
    </section>
  );
}
