import Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { builtInRoles, permissions, withRequiredReadPermissions, type AuthUser, type Identity, type Role } from "./permissions";
import { defaultPasswordPolicy, passwordPolicyError, passwordPolicySchema } from "./passwordPolicy";

const deriveKey = promisify(scrypt);
export const usernameSchema = z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/).transform((value) => value.toLowerCase());
export const passwordSchema = z.string().min(1).max(128);
export const userSchema = z.strictObject({
  username: usernameSchema, roleId: z.string().min(1).max(64), active: z.boolean(),
  password: passwordSchema.optional(),
});
export const roleSchema = z.strictObject({
  name: z.string().trim().min(1).max(64),
  permissions: z.array(z.enum(permissions)).max(permissions.length),
});

const authErrorBrand = Symbol.for("3d-pcc.auth-error");
export class AuthError extends Error {
  readonly [authErrorBrand] = true;
  constructor(public status: number, public code: string) { super(code); this.name = "AuthError"; }
}
// Bundlers may duplicate this module across server chunks, so instanceof is not reliable.
export function isAuthError(error: unknown): error is AuthError {
  return typeof error === "object" && error !== null && (error as Record<symbol, unknown>)[authErrorBrand] === true;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(password, salt, 64) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  const key = await deriveKey(password, salt, 64) as Buffer;
  return timingSafeEqual(key, Buffer.from(hash, "hex"));
}
function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
interface UserRow {
  id: string; username: string; role_id: string; active: number;
  must_change_password: number; must_change_username: number; password_hash: string;
}
interface TokenRow { id: string; user_id: string; name: string; created_at: number }
export interface ApiKeyView { id: string; userId: string; name: string; createdAt: number }
export const sessionSeconds = 12 * 60 * 60;

export function createAuthStore(file: string) {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, role_id TEXT NOT NULL,
      active INTEGER NOT NULL, password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL, must_change_username INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_roles (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, permissions TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_sessions (
      hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL, scope TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_api_keys (
      id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_attempts (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_meta (id INTEGER PRIMARY KEY CHECK(id = 1));
    CREATE TABLE IF NOT EXISTS auth_password_policy (id INTEGER PRIMARY KEY CHECK(id = 1), value TEXT NOT NULL);
  `);
  let ready: Promise<void> | undefined;
  function initialize() {
    ready ??= (async () => {
      if (db.prepare("SELECT id FROM auth_meta WHERE id = 1").get()) return;
      const passwordHash = await hashPassword("admin");
      // A persistent marker prevents re-seeding deleted accounts; the transaction handles concurrent workers.
      db.transaction(() => {
        if (db.prepare("SELECT id FROM auth_meta WHERE id = 1").get()) return;
        db.prepare(`INSERT INTO auth_users VALUES (?, 'admin', 'superadmin', 1, ?, 1, 1)`).run(randomUUID(), passwordHash);
        db.prepare("INSERT INTO auth_meta VALUES (1)").run();
      }).immediate();
    })();
    return ready;
  }
  function roles(): Role[] {
    const rows = db.prepare("SELECT id, name, permissions FROM auth_roles ORDER BY name").all() as { id: string; name: string; permissions: string }[];
    return [...builtInRoles, ...rows.map((row) => ({
      ...row, builtIn: false, permissions: z.array(z.enum(permissions)).parse(JSON.parse(row.permissions)),
    }))];
  }
  function publicUser(row: UserRow): AuthUser {
    return {
      id: row.id, username: row.username, roleId: row.role_id, active: Boolean(row.active),
      mustChangePassword: Boolean(row.must_change_password), mustChangeUsername: Boolean(row.must_change_username),
    };
  }
  function userRow(id: string): UserRow | undefined {
    return db.prepare("SELECT * FROM auth_users WHERE id = ?").get(id) as UserRow | undefined;
  }
  function identity(id: string): Identity | null {
    const row = userRow(id);
    if (!row?.active) return null;
    const role = roles().find((role) => role.id === row.role_id);
    if (!role) throw new Error("Stored authentication role is missing.");
    return { ...publicUser(row), permissions: role.permissions };
  }
  function passwordPolicy() {
    const row = db.prepare("SELECT value FROM auth_password_policy WHERE id = 1").get() as { value: string } | undefined;
    return row ? passwordPolicySchema.parse(JSON.parse(row.value)) : { ...defaultPasswordPolicy };
  }
  function savePasswordPolicy(actor: string, raw: unknown) {
    const policy = passwordPolicySchema.parse(raw);
    if (!identity(actor)?.permissions.includes("users.manage")) throw new AuthError(403, "forbidden");
    db.prepare("INSERT INTO auth_password_policy VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify(policy));
  }
  function validatePassword(password: string) {
    const error = passwordPolicyError(password, passwordPolicy());
    if (error) throw new AuthError(400, error);
  }
  function invalidate(id: string) {
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM auth_api_keys WHERE user_id = ?").run(id);
  }
  function requireRole(id: string) {
    if (!roles().some((role) => role.id === id)) throw new AuthError(400, "roleMissing");
  }
  function ensureSuperadmin(id: string, active: boolean, roleId: string) {
    const row = userRow(id);
    if (row?.active && row.role_id === "superadmin" && (!active || roleId !== "superadmin")) {
      const others = db.prepare("SELECT id FROM auth_users WHERE active = 1 AND role_id = 'superadmin' AND id <> ?").get(id);
      if (!others) throw new AuthError(409, "lastSuperadmin");
    }
  }
  function session(token: string, now = Date.now(), scope = "app"): Identity | null {
    const row = db.prepare("SELECT user_id FROM auth_sessions WHERE hash = ? AND expires_at > ? AND scope = ?").get(digest(token), now, scope) as { user_id: string } | undefined;
    return row ? identity(row.user_id) : null;
  }
  function newSession(id: string, scope = "app"): string {
    const token = randomBytes(32).toString("base64url");
    db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(Date.now());
    db.prepare("INSERT INTO auth_sessions VALUES (?, ?, ?, ?)").run(digest(token), id, Date.now() + (scope === "docs" ? 3600 : sessionSeconds) * 1000, scope);
    return token;
  }
  function throttle(username: string, now: number) {
    db.transaction(() => {
      db.prepare("DELETE FROM auth_attempts WHERE expires_at <= ?").run(now);
      for (const [bucket, limit, duration] of [["global", 100, 60_000], [`user:${username}`, 10, 900_000]] as const) {
        const row = db.prepare("SELECT count FROM auth_attempts WHERE bucket = ?").get(bucket) as { count: number } | undefined;
        if (row && row.count >= limit) throw new AuthError(429, "rateLimited");
        db.prepare("INSERT INTO auth_attempts VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1").run(bucket, now + duration);
      }
    }).immediate();
  }
  async function login(username: string, password: string, now = Date.now()) {
    await initialize();
    throttle(username, now);
    const row = db.prepare("SELECT * FROM auth_users WHERE username = ?").get(username) as UserRow | undefined;
    const fallback = db.prepare("SELECT password_hash FROM auth_users LIMIT 1").get() as { password_hash: string };
    const valid = await verifyPassword(password, row?.password_hash ?? fallback.password_hash);
    if (!valid || !row?.active) throw new AuthError(401, "invalidLogin");
    // Recheck after asynchronous password verification in case an administrator changed the account.
    const current = userRow(row.id);
    if (!current?.active || current.password_hash !== row.password_hash) throw new AuthError(401, "invalidLogin");
    db.prepare("DELETE FROM auth_attempts WHERE bucket = ?").run(`user:${username}`);
    return { token: newSession(row.id), user: identity(row.id)! };
  }
  async function changeCredentials(id: string, username: string, oldPassword: string, password: string) {
    username = usernameSchema.parse(username);
    passwordSchema.parse(password);
    validatePassword(password);
    const row = userRow(id);
    throttle(`credentials:${id}`, Date.now());
    if (!row || !await verifyPassword(oldPassword, row.password_hash)) throw new AuthError(401, "invalidLogin");
    if (row.must_change_username && username === "admin") throw new AuthError(400, "usernameUnchanged");
    if (password === oldPassword) throw new AuthError(400, "passwordUnchanged");
    const hash = await hashPassword(password);
    db.transaction(() => {
      const current = userRow(id);
      if (!current?.active || current.password_hash !== row.password_hash) throw new AuthError(409, "accountChanged");
      validatePassword(password);
      const existing = db.prepare("SELECT id FROM auth_users WHERE username = ? AND id <> ?").get(username, id);
      if (existing) throw new AuthError(409, "usernameTaken");
      db.prepare("UPDATE auth_users SET username = ?, password_hash = ?, must_change_password = 0, must_change_username = 0 WHERE id = ?").run(username, hash, id);
      invalidate(id);
    }).immediate();
    return newSession(id);
  }
  async function saveUser(actor: string, id: string | undefined, raw: unknown) {
    const input = userSchema.parse(raw);
    if (!id && !input.password) throw new AuthError(400, "passwordRequired");
    if (input.password) validatePassword(input.password);
    const hash = input.password ? await hashPassword(input.password) : undefined;
    db.transaction(() => {
      if (!identity(actor)?.permissions.includes("users.manage")) throw new AuthError(403, "forbidden");
      if (input.password) validatePassword(input.password);
      requireRole(input.roleId);
      if (id && !userRow(id)) throw new AuthError(404, "userMissing");
      if (actor === id && (!input.active || input.roleId !== "superadmin" || hash)) throw new AuthError(409, "ownAccount");
      if (id) ensureSuperadmin(id, input.active, input.roleId);
      const existing = db.prepare("SELECT id FROM auth_users WHERE username = ?").get(input.username) as { id: string } | undefined;
      if (existing && existing.id !== id) throw new AuthError(409, "usernameTaken");
      if (id) {
        db.prepare("UPDATE auth_users SET username = ?, role_id = ?, active = ? WHERE id = ?").run(input.username, input.roleId, Number(input.active), id);
        if (hash) db.prepare("UPDATE auth_users SET password_hash = ?, must_change_password = 1 WHERE id = ?").run(hash, id);
        invalidate(id);
      } else {
        db.prepare("INSERT INTO auth_users VALUES (?, ?, ?, ?, ?, 1, 0)").run(randomUUID(), input.username, input.roleId, Number(input.active), hash);
      }
    }).immediate();
  }
  function deleteUser(actor: string, id: string) {
    db.transaction(() => {
      if (!identity(actor)?.permissions.includes("users.manage")) throw new AuthError(403, "forbidden");
      if (actor === id) throw new AuthError(409, "ownAccount");
      if (!userRow(id)) throw new AuthError(404, "userMissing");
      ensureSuperadmin(id, false, "");
      db.prepare("DELETE FROM auth_users WHERE id = ?").run(id);
    }).immediate();
  }
  function saveRole(actor: string, id: string | undefined, raw: unknown) {
    const input = roleSchema.parse(raw);
    db.transaction(() => {
      if (!identity(actor)?.permissions.includes("users.manage")) throw new AuthError(403, "forbidden");
      if (id && builtInRoles.some((role) => role.id === id)) throw new AuthError(400, "builtInRole");
      if (id && !roles().some((role) => role.id === id)) throw new AuthError(404, "roleMissing");
      if (roles().some((role) => role.id !== id && role.name.toLowerCase() === input.name.toLowerCase())) throw new AuthError(409, "roleNameTaken");
      db.prepare("INSERT INTO auth_roles VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, permissions = excluded.permissions")
        .run(id ?? randomUUID(), input.name, JSON.stringify(withRequiredReadPermissions(input.permissions)));
      // Role changes take effect immediately; revoke tokens as well.
      if (id) for (const row of db.prepare("SELECT id FROM auth_users WHERE role_id = ?").all(id) as { id: string }[]) invalidate(row.id);
    }).immediate();
  }
  function deleteRole(actor: string, id: string) {
    db.transaction(() => {
      if (!identity(actor)?.permissions.includes("users.manage")) throw new AuthError(403, "forbidden");
      if (builtInRoles.some((role) => role.id === id)) throw new AuthError(400, "builtInRole");
      if (db.prepare("SELECT id FROM auth_users WHERE role_id = ?").get(id)) throw new AuthError(409, "roleInUse");
      if (!db.prepare("DELETE FROM auth_roles WHERE id = ?").run(id).changes) throw new AuthError(404, "roleMissing");
    }).immediate();
  }
  function apiIdentity(token: string): Identity | null {
    const row = db.prepare("SELECT user_id FROM auth_api_keys WHERE hash = ?").get(digest(token)) as { user_id: string } | undefined;
    const user = row ? identity(row.user_id) : null;
    return user && !user.mustChangePassword && !user.mustChangeUsername && user.permissions.includes("api.use") ? user : null;
  }
  function requireApiUser(userId: string) {
    const user = identity(userId);
    if (!user || user.mustChangePassword || user.mustChangeUsername || !user.permissions.includes("api.use")) throw new AuthError(409, "apiUserNotReady");
  }
  function createApiKey(actor: string, userId: string, name: string): string {
    return db.transaction(() => {
      if (!identity(actor)?.permissions.includes("users.manage")) throw new AuthError(403, "forbidden");
      requireApiUser(userId);
      const count = db.prepare("SELECT COUNT(*) AS count FROM auth_api_keys WHERE user_id = ?").get(userId) as { count: number };
      if (count.count >= 10) throw new AuthError(409, "keyLimit");
      const token = `pcc_${randomBytes(32).toString("base64url")}`;
      db.prepare("INSERT INTO auth_api_keys VALUES (?, ?, ?, ?, ?)").run(randomUUID(), digest(token), userId, name, Date.now());
      return token;
    }).immediate();
  }
  function regenerateApiKey(actor: string, id: string): string {
    return db.transaction(() => {
      if (!identity(actor)?.permissions.includes("users.manage")) throw new AuthError(403, "forbidden");
      const key = db.prepare("SELECT user_id FROM auth_api_keys WHERE id = ?").get(id) as { user_id: string } | undefined;
      if (!key) throw new AuthError(404, "keyMissing");
      requireApiUser(key.user_id);
      const token = `pcc_${randomBytes(32).toString("base64url")}`;
      db.prepare("UPDATE auth_api_keys SET hash = ?, created_at = ? WHERE id = ?").run(digest(token), Date.now(), id);
      db.prepare("DELETE FROM auth_sessions WHERE user_id = ? AND scope = 'docs'").run(key.user_id);
      return token;
    }).immediate();
  }
  function revokeApiKey(actor: string, id: string) {
    if (!identity(actor)?.permissions.includes("users.manage")) throw new AuthError(403, "forbidden");
    db.transaction(() => {
      const key = db.prepare("SELECT user_id FROM auth_api_keys WHERE id = ?").get(id) as { user_id: string } | undefined;
      if (!key) throw new AuthError(404, "keyMissing");
      db.prepare("DELETE FROM auth_api_keys WHERE id = ?").run(id);
      db.prepare("DELETE FROM auth_sessions WHERE user_id = ? AND scope = 'docs'").run(key.user_id);
    }).immediate();
  }
  function overview() {
    const users = (db.prepare("SELECT * FROM auth_users ORDER BY username").all() as UserRow[]).map(publicUser);
    const keys = (db.prepare("SELECT id, user_id, name, created_at FROM auth_api_keys ORDER BY created_at DESC").all() as TokenRow[])
      .map((row): ApiKeyView => ({ id: row.id, userId: row.user_id, name: row.name, createdAt: row.created_at }));
    return { users, roles: roles(), keys, passwordPolicy: passwordPolicy() };
  }
  return { initialize, login, session, identity, newSession, changeCredentials, saveUser, deleteUser,
    saveRole, deleteRole, apiIdentity, createApiKey, regenerateApiKey, revokeApiKey, overview, passwordPolicy, savePasswordPolicy,
    logout: (token: string) => { db.prepare("DELETE FROM auth_sessions WHERE hash = ?").run(digest(token)); },
    backup: (destination: string) => db.backup(destination),
    clearSessions: () => db.exec("DELETE FROM auth_sessions; DELETE FROM auth_attempts"),
    close: () => db.close(),
  };
}

const globalAuth = globalThis as typeof globalThis & { __pccAuthStore?: ReturnType<typeof createAuthStore> };
const authDatabasePath = path.join(process.cwd(), "data", "auth.db");

export function getAuthStore() {
  if (!globalAuth.__pccAuthStore) {
    mkdirSync(path.dirname(authDatabasePath), { recursive: true });
    globalAuth.__pccAuthStore = createAuthStore(authDatabasePath);
  }
  return globalAuth.__pccAuthStore;
}

export async function exportAuthDatabase(): Promise<Buffer> {
  const file = `${authDatabasePath}.${randomUUID()}.backup`;
  try {
    const store = getAuthStore();
    await store.initialize();
    await store.backup(file);
    return await readFile(file);
  } finally {
    await rm(file, { force: true });
  }
}

export async function verifyAuthDatabase(data: Buffer): Promise<void> {
  const file = `${authDatabasePath}.${randomUUID()}.verify`;
  await writeFile(file, data, { mode: 0o600 });
  try {
    const database = new Database(file, { readonly: true, fileMustExist: true });
    try {
      const integrity = database.pragma("integrity_check") as { integrity_check: string }[];
      if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
        throw new Error("Backup authentication database is corrupt.");
      }
      const tables = new Set((database.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
      ).all() as { name: string }[]).map((table) => table.name));
      for (const table of ["auth_users", "auth_roles", "auth_sessions", "auth_api_keys", "auth_meta"]) {
        if (!tables.has(table)) throw new Error("Backup authentication database is incomplete.");
      }
      if (!database.prepare("SELECT id FROM auth_meta WHERE id = 1").get()) {
        throw new Error("Backup authentication database is not initialized.");
      }
    } finally {
      database.close();
    }
  } finally {
    await rm(file, { force: true });
  }
}

export async function restoreAuthDatabase(data: Buffer): Promise<void> {
  const tempFile = `${authDatabasePath}.${randomUUID()}.restore`;
  await writeFile(tempFile, data, { mode: 0o600 });
  const prepared = createAuthStore(tempFile);
  try {
    await prepared.initialize();
    prepared.clearSessions();
  } finally {
    await prepared.close();
  }
  await rm(`${tempFile}-shm`, { force: true });
  await rm(`${tempFile}-wal`, { force: true });
  const current = globalAuth.__pccAuthStore;
  if (current) await current.close();
  await rm(`${authDatabasePath}-shm`, { force: true });
  await rm(`${authDatabasePath}-wal`, { force: true });
  await rm(authDatabasePath, { force: true });
  await rename(tempFile, authDatabasePath);
  const restored = createAuthStore(authDatabasePath);
  await restored.initialize();
  globalAuth.__pccAuthStore = restored;
}
