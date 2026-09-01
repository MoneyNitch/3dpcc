import type { AppSettings, ParsedPrint, PrintCostInputs } from "../types";
import { resolveDbConnection } from "../dbConfig";
import type { DataStore } from "./shared";

// The active backend is resolved from the DB config saved via Settings (data/db-config.json),
// falling back to DB_DRIVER/DATABASE_URL env vars if nothing was saved there yet.
const globalForStore = globalThis as unknown as { __filarechnerStore?: Promise<DataStore> };

function createStore(): Promise<DataStore> {
  const resolved = resolveDbConnection();
  if (resolved.driver === "postgres") {
    return import("./postgresStore").then((m) => m.createPostgresStore(resolved.connectionString));
  }
  if (resolved.driver === "mysql") {
    return import("./mysqlStore").then((m) => m.createMysqlStore(resolved.connectionString));
  }
  return import("./sqliteStore").then((m) => m.createSqliteStore());
}

function getStore(): Promise<DataStore> {
  if (!globalForStore.__filarechnerStore) {
    globalForStore.__filarechnerStore = createStore();
  }
  return globalForStore.__filarechnerStore;
}

/** Forces the next call to rebuild the DB connection, e.g. after saving new DB settings. */
export function resetStoreCache(): void {
  globalForStore.__filarechnerStore = undefined;
}

export async function getSettings(): Promise<AppSettings> {
  return (await getStore()).getSettings();
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return (await getStore()).saveSettings(settings);
}

export async function insertPrint(print: ParsedPrint): Promise<void> {
  return (await getStore()).insertPrint(print);
}

export async function listPrints(): Promise<ParsedPrint[]> {
  return (await getStore()).listPrints();
}

export async function getPrint(id: string): Promise<ParsedPrint | null> {
  return (await getStore()).getPrint(id);
}

export async function deletePrint(id: string): Promise<void> {
  return (await getStore()).deletePrint(id);
}

export async function getPrintCostInputs(id: string): Promise<PrintCostInputs | null> {
  return (await getStore()).getPrintCostInputs(id);
}

export async function savePrintCostInputs(id: string, inputs: PrintCostInputs): Promise<void> {
  return (await getStore()).savePrintCostInputs(id, inputs);
}
