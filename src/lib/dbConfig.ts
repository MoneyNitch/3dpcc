import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Lets the database backend be switched from the Settings UI instead of only via
// .env files. The connection password is:
//  - never written to disk in plain text (AES-256-GCM, key kept in a separate file)
//  - never sent back to the browser once saved (the API only reports whether one is set)
// This protects against casually opening the config file or the browser network tab;
// it does not protect against someone with full OS-level access to the server itself.

export type DbDriver = "sqlite" | "postgres" | "mysql";

interface DbConnectionFields {
  host: string;
  port: number;
  database: string;
  user: string;
}

interface StoredDbConfig {
  driver: DbDriver;
  connection: (DbConnectionFields & { passwordEncrypted: string | null }) | null;
}

export interface DbConfigView {
  driver: DbDriver;
  host: string;
  port: number;
  database: string;
  user: string;
  hasPassword: boolean;
}

export interface SaveDbConfigInput {
  driver: DbDriver;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  /** Empty/undefined keeps the previously saved password. */
  password?: string;
}

const dataDir = path.join(process.cwd(), "data");
const configPath = path.join(dataDir, "db-config.json");
const keyPath = path.join(dataDir, ".dbkey");

function ensureDataDir(): void {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function getEncryptionKey(): Buffer {
  ensureDataDir();
  if (fs.existsSync(keyPath)) {
    return Buffer.from(fs.readFileSync(keyPath, "utf-8").trim(), "base64");
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key.toString("base64"), { mode: 0o600 });
  return key;
}

function encrypt(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf-8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString("base64")).join(":");
}

function decrypt(payload: string): string {
  const key = getEncryptionKey();
  const [ivB64, authTagB64, ciphertextB64] = payload.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf-8");
}

function readStoredConfig(): StoredDbConfig | null {
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8")) as StoredDbConfig;
  } catch {
    return null;
  }
}

function writeStoredConfig(config: StoredDbConfig): void {
  ensureDataDir();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}

/** Safe to send to the browser: the password itself is never included. */
export function getDbConfigView(): DbConfigView {
  const stored = readStoredConfig();
  if (!stored?.connection) {
    return { driver: stored?.driver ?? "sqlite", host: "", port: 5432, database: "", user: "", hasPassword: false };
  }
  return {
    driver: stored.driver,
    host: stored.connection.host,
    port: stored.connection.port,
    database: stored.connection.database,
    user: stored.connection.user,
    hasPassword: !!stored.connection.passwordEncrypted,
  };
}

/** Server-only: decrypts the currently stored password, if any. */
export function getStoredPassword(): string | undefined {
  const stored = readStoredConfig();
  const encrypted = stored?.connection?.passwordEncrypted;
  return encrypted ? decrypt(encrypted) : undefined;
}

export function saveDbConfig(input: SaveDbConfigInput): void {
  if (input.driver === "sqlite") {
    writeStoredConfig({ driver: "sqlite", connection: null });
    return;
  }
  const existing = readStoredConfig();
  const passwordEncrypted = input.password
    ? encrypt(input.password)
    : (existing?.connection?.passwordEncrypted ?? null);

  writeStoredConfig({
    driver: input.driver,
    connection: {
      host: input.host ?? "",
      port: input.port ?? (input.driver === "mysql" ? 3306 : 5432),
      database: input.database ?? "",
      user: input.user ?? "",
      passwordEncrypted,
    },
  });
}

export function buildConnectionString(
  driver: "postgres" | "mysql",
  conn: DbConnectionFields,
  password: string | undefined
): string {
  const scheme = driver === "postgres" ? "postgres" : "mysql";
  const auth = conn.user
    ? `${encodeURIComponent(conn.user)}${password ? ":" + encodeURIComponent(password) : ""}@`
    : "";
  return `${scheme}://${auth}${conn.host}:${conn.port}/${conn.database}`;
}

export interface ResolvedDbConnection {
  driver: DbDriver;
  connectionString?: string;
}

/** Determines which backend to use: UI-saved config takes precedence, then env vars. */
export function resolveDbConnection(): ResolvedDbConnection {
  const stored = readStoredConfig();
  if (stored) {
    if (stored.driver === "sqlite" || !stored.connection) return { driver: "sqlite" };
    const password = stored.connection.passwordEncrypted
      ? decrypt(stored.connection.passwordEncrypted)
      : undefined;
    return {
      driver: stored.driver,
      connectionString: buildConnectionString(stored.driver, stored.connection, password),
    };
  }

  // No UI config saved yet — fall back to env vars (e.g. Docker/.env workflows).
  const envDriver = (process.env.DB_DRIVER ?? "sqlite").toLowerCase();
  if (envDriver === "postgres" || envDriver === "postgresql") {
    return { driver: "postgres", connectionString: process.env.DATABASE_URL };
  }
  if (envDriver === "mysql" || envDriver === "mariadb") {
    return { driver: "mysql", connectionString: process.env.DATABASE_URL };
  }
  return { driver: "sqlite" };
}
