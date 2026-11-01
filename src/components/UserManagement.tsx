"use client";

import { useState } from "react";
import { useLocale } from "@/lib/locale";
import { permissions, type AuthUser, type Permission, type Role } from "@/lib/auth/permissions";
import type { ApiKeyView } from "@/lib/auth/store";

interface Overview { users: AuthUser[]; roles: Role[]; keys: ApiKeyView[] }
const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950";
const buttonClass = "rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700";

export function UserManagement({ initial, actorId }: { initial: Overview; actorId: string }) {
  const { t } = useLocale();
  const [overview, setOverview] = useState(initial);
  const [userId, setUserId] = useState<string>();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("viewer");
  const [active, setActive] = useState(true);
  const [customId, setCustomId] = useState<string>();
  const [roleName, setRoleName] = useState("");
  const [grants, setGrants] = useState<Permission[]>([]);
  const [keyUserId, setKeyUserId] = useState(initial.users.find((user) => !user.mustChangePassword)?.id ?? "");
  const [keyName, setKeyName] = useState("");
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
  function resetUser() { setUserId(undefined); setUsername(""); setPassword(""); setRoleId("viewer"); setActive(true); }
  function editUser(user: AuthUser) { setUserId(user.id); setUsername(user.username); setRoleId(user.roleId); setActive(user.active); setPassword(""); }
  function resetRole() { setCustomId(undefined); setRoleName(""); setGrants([]); }
  function editRole(role: Role) { setCustomId(role.id); setRoleName(role.name); setGrants(role.permissions); }
  async function saveUser(event: React.FormEvent) {
    event.preventDefault();
    if (await send({ action: "saveUser", id: userId, data: { username, roleId, active, ...(password ? { password } : {}) } })) resetUser();
  }
  async function saveRole(event: React.FormEvent) {
    event.preventDefault();
    if (await send({ action: "saveRole", id: customId, data: { name: roleName, permissions: grants } })) resetRole();
  }
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">{t("auth.users")}</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">{t("auth.rolesHelp")}</p>
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
      {message && <p role="status" className="text-green-700 dark:text-green-400">{message}</p>}
      <fieldset disabled={busy} className="min-w-0 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <legend className="px-2 font-semibold">{t("auth.users")}</legend>
        <div className="flex flex-col gap-2">
          {overview.users.map((user) => <div key={user.id} className="flex flex-wrap items-center gap-2 border-b border-slate-200 py-2 dark:border-slate-800">
            <span className="font-medium">{user.username}</span>
            <span className="text-sm">{overview.roles.find((role) => role.id === user.roleId)?.name}</span>
            <span className="text-sm text-slate-500">{t(user.active ? "auth.active" : "auth.inactive")}</span>
            {user.mustChangePassword && <span className="text-sm text-orange-600">{t("auth.changePending")}</span>}
            {user.id !== actorId && <><button className={buttonClass} onClick={() => editUser(user)}>{t("auth.edit")}</button>
              <button className={buttonClass} onClick={() => { if (window.confirm(t("auth.confirmDelete"))) void send({ action: "deleteUser", id: user.id }); }}>{t("auth.delete")}</button></>}
          </div>)}
        </div>
        <form onSubmit={saveUser} className="mt-4 grid gap-3 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">{t(userId ? "auth.editUser" : "auth.newUser")}</h2>
          <label className="text-sm">{t("auth.username")}<input className={inputClass} value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={64} autoComplete="off" /></label>
          <label className="text-sm">{t(userId ? "auth.resetPassword" : "auth.password")}<input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required={!userId} minLength={12} maxLength={128} autoComplete="new-password" /></label>
          <label className="text-sm">{t("auth.role")}<select className={inputClass} value={roleId} onChange={(event) => setRoleId(event.target.value)}>{overview.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />{t("auth.active")}</label>
          <p className="text-sm text-slate-500 sm:col-span-2">{t("auth.userPasswordHelp")}</p>
          <div className="flex gap-2"><button className={buttonClass} type="submit">{t("auth.save")}</button><button className={buttonClass} type="button" onClick={resetUser}>{t("auth.cancel")}</button></div>
        </form>
      </fieldset>
      <fieldset disabled={busy} className="min-w-0 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <legend className="px-2 font-semibold">{t("auth.customRoles")}</legend>
        {overview.roles.map((role) => <div key={role.id} className="flex flex-wrap items-center gap-2 py-2">
          <span className="font-medium">{role.name}</span>
          {!role.builtIn && <><button className={buttonClass} onClick={() => editRole(role)}>{t("auth.edit")}</button><button className={buttonClass} onClick={() => { if (window.confirm(t("auth.confirmDelete"))) void send({ action: "deleteRole", id: role.id }); }}>{t("auth.delete")}</button></>}
        </div>)}
        <form onSubmit={saveRole} className="mt-3 flex flex-col gap-3">
          <label className="text-sm">{t("auth.roleName")}<input className={inputClass} value={roleName} onChange={(event) => setRoleName(event.target.value)} required maxLength={64} /></label>
          <div className="grid gap-2 sm:grid-cols-2">{permissions.map((permission) => <label key={permission} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={grants.includes(permission)} onChange={(event) => setGrants((current) => event.target.checked ? [...current, permission] : current.filter((value) => value !== permission))} />{t(`auth.permission.${permission}`)}</label>)}</div>
          <div className="flex gap-2"><button className={buttonClass} type="submit">{t("auth.saveRole")}</button><button className={buttonClass} type="button" onClick={resetRole}>{t("auth.cancel")}</button></div>
        </form>
      </fieldset>
      <fieldset disabled={busy} className="min-w-0 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <legend className="px-2 font-semibold">{t("auth.apiKeys")}</legend>
        <p className="text-sm text-slate-500">{t("auth.apiHelp")}</p>
        {token && <div role="status" className="my-3 rounded-lg border border-orange-400 p-3"><p>{t("auth.keyOnce")}</p><code className="block select-all break-all">{token}</code><button className={buttonClass} onClick={() => setToken("")}>{t("auth.dismissKey")}</button></div>}
        {overview.keys.map((key) => <div key={key.id} className="flex flex-wrap items-center gap-2 py-2"><span>{key.name} ({overview.users.find((user) => user.id === key.userId)?.username})</span><button className={buttonClass} onClick={() => { if (window.confirm(t("auth.confirmDelete"))) void send({ action: "revokeKey", id: key.id }); }}>{t("auth.revoke")}</button></div>)}
        <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void send({ action: "createKey", userId: keyUserId, name: keyName }); }}>
          <label className="text-sm">{t("auth.username")}<select className={inputClass} required value={keyUserId} onChange={(event) => setKeyUserId(event.target.value)}><option value="">{t("auth.chooseUser")}</option>{overview.users.filter((user) => user.active && !user.mustChangePassword && !user.mustChangeUsername && overview.roles.find((role) => role.id === user.roleId)?.permissions.includes("api.use")).map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}</select></label>
          <label className="text-sm">{t("auth.keyName")}<input className={inputClass} value={keyName} onChange={(event) => setKeyName(event.target.value)} required maxLength={64} /></label>
          <button type="submit" className={buttonClass}>{t("auth.createKey")}</button>
        </form>
      </fieldset>
    </div>
  );
}
