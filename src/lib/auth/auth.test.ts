import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAuthStore, AuthError, hashPassword, verifyPassword } from "./store";
import { apiPermission, hasPermission } from "./permissions";
import { canUpdateSettings } from "./settings";
import { defaultSettings } from "../db/shared";
import { authEnabled, authErrorResponse, checkOrigin, setSessionCookie } from "./server";

const password = "a-long-test-password";
async function fixture() {
  const store = createAuthStore(":memory:");
  await store.initialize();
  const initial = await store.login("admin", "admin");
  const token = await store.changeCredentials(initial.user.id, "owner", "admin", password);
  const owner = store.session(token)!;
  return { store, owner, token, initial };
}
function errorCode(code: string) {
  return (error: unknown) => error instanceof AuthError && error.code === code;
}

test("auth errors are recognised even when the class is duplicated by bundling", async () => {
  const brand = Symbol.for("3d-pcc.auth-error");
  class DuplicatedAuthError extends Error {
    constructor(public status: number, public code: string) { super(code); Object.defineProperty(this, brand, { value: true }); }
  }
  const response = authErrorResponse(new DuplicatedAuthError(400, "usernameUnchanged"));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "usernameUnchanged" });
});

test("passwords use salted hashes and reject incorrect values", async () => {
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("incorrect", first), false);
  assert.ok(!first.includes(password));
});

test("bootstrap is atomic, persistent and requires both credentials to change", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pcc-auth-"));
  const file = path.join(directory, "auth.db");
  const first = createAuthStore(file);
  const second = createAuthStore(file);
  try {
    await Promise.all([first.initialize(), second.initialize()]);
    assert.equal(first.overview().users.length, 1);
    const login = await first.login("admin", "admin");
    assert.equal(login.user.roleId, "superadmin");
    assert.equal(login.user.mustChangePassword, true);
    assert.equal(login.user.mustChangeUsername, true);
    await assert.rejects(first.changeCredentials(login.user.id, "admin", "admin", password), errorCode("usernameUnchanged"));
    await assert.rejects(first.changeCredentials(login.user.id, "owner", "wrong", password), errorCode("invalidLogin"));
    const token = await first.changeCredentials(login.user.id, "owner", "admin", password);
    assert.equal(first.session(login.token), null);
    assert.equal(second.session(token)?.mustChangePassword, false);
    assert.equal(second.session(token)?.username, "owner");
    const relogin = await second.login("owner", password);
    await assert.rejects(second.changeCredentials(relogin.user.id, "owner", password, password), errorCode("passwordUnchanged"));
    assert.equal(second.session(`${token}tampered`), null);
    assert.equal(second.session(token, Date.now() + 13 * 3600_000), null);
    await assert.rejects(first.login("admin", "admin"), errorCode("invalidLogin"));
    assert.equal((await second.login("owner", password)).user.username, "owner");
    assert.ok(!JSON.stringify(second.overview()).includes(password));
    first.logout(token);
    assert.equal(second.session(token), null);
  } finally { first.close(); second.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("users, custom roles and last-superadmin invariants are enforced", async () => {
  const { store, owner } = await fixture();
  try {
    await assert.rejects(store.saveUser(owner.id, undefined, { username: "viewer", roleId: "missing", active: true, password }), errorCode("roleMissing"));
    await store.saveUser(owner.id, undefined, { username: "reader", roleId: "viewer", active: true, password });
    const reader = store.overview().users.find((user) => user.username === "reader")!;
    const login = await store.login("reader", password);
    assert.equal(login.user.mustChangePassword, true);
    assert.throws(() => store.createApiKey(owner.id, reader.id, "premature"), errorCode("apiUserNotReady"));
    const readerToken = await store.changeCredentials(reader.id, "reader", password, password + "-new");
    assert.equal(hasPermission(store.session(readerToken), "prints.write"), false);
    await assert.rejects(store.saveUser(reader.id, undefined, { username: "hacker", roleId: "superadmin", active: true, password }), errorCode("forbidden"));
    assert.throws(() => store.deleteUser(reader.id, owner.id), errorCode("forbidden"));
    assert.throws(() => store.deleteUser(owner.id, owner.id), errorCode("ownAccount"));
    store.saveRole(owner.id, undefined, { name: "Custom printer", permissions: ["prints.write", "api.use"] });
    const custom = store.overview().roles.find((role) => role.name === "Custom printer")!;
    assert.deepEqual(custom.permissions.sort(), ["api.use", "prints.read", "prints.write"]);
    assert.throws(() => store.saveRole(owner.id, undefined, { name: "Privilege escalation", permissions: ["users.manage"] }));
    assert.throws(() => store.saveRole(owner.id, "viewer", { name: "Changed", permissions: [] }), errorCode("builtInRole"));
    await store.saveUser(owner.id, reader.id, { username: "reader", roleId: custom.id, active: true });
    assert.equal(store.session(readerToken), null);
    assert.throws(() => store.deleteRole(owner.id, custom.id), errorCode("roleInUse"));
    const customToken = (await store.login("reader", password + "-new")).token;
    const apiKey = store.createApiKey(owner.id, reader.id, "test");
    assert.equal(store.apiIdentity(apiKey)?.roleId, custom.id);
    store.saveRole(owner.id, custom.id, { name: "Custom printer", permissions: ["prints.read", "api.use"] });
    assert.equal(store.session(customToken), null);
    assert.equal(store.apiIdentity(apiKey), null);
    await store.saveUser(owner.id, undefined, { username: "backup", roleId: "superadmin", active: true, password });
    const backup = store.overview().users.find((user) => user.username === "backup")!;
    await store.changeCredentials(backup.id, "backup", password, password + "-backup");
    await store.saveUser(backup.id, owner.id, { username: "owner", roleId: "admin", active: true });
    assert.throws(() => store.deleteUser(owner.id, backup.id), errorCode("forbidden"));
    // A stale actor cannot demote the remaining superadmin after its own demotion.
    assert.equal(store.identity(owner.id)?.permissions.includes("users.manage"), false);
    store.deleteUser(backup.id, reader.id);
    store.deleteRole(backup.id, custom.id);
  } finally { store.close(); }
});

test("API keys are scoped to active users, docs sessions cannot log into the app, and resets revoke everything", async () => {
  const { store, owner, token } = await fixture();
  try {
    const key = store.createApiKey(owner.id, owner.id, "integration");
    assert.equal(store.apiIdentity(key)?.id, owner.id);
    assert.equal(store.apiIdentity(key + "x"), null);
    const docsToken = store.newSession(owner.id, "docs");
    assert.equal(store.session(docsToken), null);
    assert.equal(store.session(docsToken, Date.now(), "docs")?.id, owner.id);
    store.revokeApiKey(owner.id, store.overview().keys[0].id);
    assert.equal(store.apiIdentity(key), null);
    assert.equal(store.session(docsToken, Date.now(), "docs"), null);
    assert.equal(store.session(token)?.id, owner.id);
    const anotherKey = store.createApiKey(owner.id, owner.id, "another");
    await store.changeCredentials(owner.id, "owner", password, password + "-new");
    assert.equal(store.apiIdentity(anotherKey), null);
    assert.equal(store.session(token), null);
    await store.saveUser(owner.id, undefined, { username: "reader", roleId: "viewer", active: true, password });
    const reader = store.overview().users.find((user) => user.username === "reader")!;
    const readerToken = await store.changeCredentials(reader.id, "reader", password, password + "-reader");
    const readerKey = store.createApiKey(owner.id, reader.id, "reader");
    await store.saveUser(owner.id, reader.id, { username: "reader", roleId: "viewer", active: false });
    assert.equal(store.apiIdentity(readerKey), null);
    assert.equal(store.session(readerToken), null);
    await assert.rejects(store.login("reader", password + "-reader"), errorCode("invalidLogin"));
  } finally { store.close(); }
});

test("login throttling expires after its configured window", async () => {
  const { store } = await fixture();
  try {
    const now = Date.now();
    for (let index = 0; index < 10; index++) await assert.rejects(store.login("missing", "incorrect", now), errorCode("invalidLogin"));
    await assert.rejects(store.login("missing", "incorrect", now), errorCode("rateLimited"));
    await assert.rejects(store.login("missing", "incorrect", now + 901_000), errorCode("invalidLogin"));
  } finally { store.close(); }
});

test("password reset forces another change and invalidates tokens", async () => {
  const { store, owner } = await fixture();
  try {
    await store.saveUser(owner.id, undefined, { username: "reader", roleId: "viewer", active: true, password });
    const reader = store.overview().users.find((user) => user.username === "reader")!;
    const token = await store.changeCredentials(reader.id, "reader", password, password + "-new");
    const key = store.createApiKey(owner.id, reader.id, "reader");
    await store.saveUser(owner.id, reader.id, { username: "reader", roleId: "viewer", active: true, password: password + "-reset" });
    assert.equal(store.session(token), null);
    assert.equal(store.apiIdentity(key), null);
    const login = await store.login("reader", password + "-reset");
    assert.equal(login.user.mustChangePassword, true);
    assert.throws(() => store.createApiKey(owner.id, reader.id, "reader"), errorCode("apiUserNotReady"));
  } finally { store.close(); }
});

test("persistent attempt limits apply to another database connection", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pcc-auth-attempts-"));
  const file = path.join(directory, "auth.db");
  const first = createAuthStore(file);
  const second = createAuthStore(file);
  try {
    await first.initialize();
    for (let index = 0; index < 10; index++) await assert.rejects(first.login("missing", "incorrect"), errorCode("invalidLogin"));
    await assert.rejects(second.login("missing", "incorrect"), errorCode("rateLimited"));
  } finally { first.close(); second.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("permission matrix separates document changes from regular settings", () => {
  const documents = { id: "1", username: "test", roleId: "custom", active: true, mustChangePassword: false, mustChangeUsername: false,
    permissions: ["documents.write"] as const };
  const identity = { ...documents, permissions: [...documents.permissions] };
  const numbering = structuredClone(defaultSettings);
  numbering.numbering.invoice.nextNumber++;
  assert.equal(canUpdateSettings(identity, defaultSettings, numbering), true);
  numbering.general.companyName = "Not allowed";
  assert.equal(canUpdateSettings(identity, defaultSettings, numbering), false);
  assert.equal(apiPermission("/prints/{id}/calculate", "POST"), "prints.read");
  assert.equal(apiPermission("/prints/{id}/plates", "PATCH"), "prints.write");
  assert.equal(apiPermission("/invoices/templates/{id}", "PUT"), "documents.write");
  assert.equal(apiPermission("/quotes", "POST"), "documents.write");
  assert.equal(apiPermission("/settings", "PUT"), "settings.write");
});

test("environment switch fails closed, origin checks prevent CSRF, cookies have secure attributes", () => {
  const saved = { enabled: process.env.AUTH_ENABLED, origin: process.env.AUTH_ORIGIN, secure: process.env.AUTH_COOKIE_SECURE };
  try {
    delete process.env.AUTH_ENABLED;
    assert.equal(authEnabled(), true);
    process.env.AUTH_ENABLED = "false";
    assert.equal(authEnabled(), false);
    assert.equal(hasPermission(null, "users.manage", false), true);
    process.env.AUTH_ENABLED = "typo";
    assert.throws(authEnabled);
    delete process.env.AUTH_ORIGIN;
    const request = new Request("http://localhost/api/auth", { method: "POST", headers: { Origin: "http://localhost" } });
    assert.doesNotThrow(() => checkOrigin(request));
    assert.throws(() => checkOrigin(new Request(request.url, { method: "POST", headers: { Origin: "https://attacker.example" } })), errorCode("invalidOrigin"));
    assert.throws(() => checkOrigin(new Request(request.url, { method: "POST" })), errorCode("invalidOrigin"));
    process.env.AUTH_ORIGIN = "https://app.example";
    assert.doesNotThrow(() => checkOrigin(new Request(request.url, { method: "POST", headers: { Origin: "https://app.example" } })));
    process.env.AUTH_COOKIE_SECURE = "true";
    const response = Response.json({ ok: true });
    setSessionCookie(response, request, "test-token");
    assert.match(response.headers.get("set-cookie")!, /HttpOnly; SameSite=Lax; Max-Age=43200; Secure/);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  } finally {
    for (const [name, value] of Object.entries({ AUTH_ENABLED: saved.enabled, AUTH_ORIGIN: saved.origin, AUTH_COOKIE_SECURE: saved.secure })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
