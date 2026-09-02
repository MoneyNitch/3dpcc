import { Pool } from "pg";
import type { AppSettings, ParsedPrint, PrintCostInputs } from "../types";
import { defaultSettings, migrateSettings, type DataStore } from "./shared";

async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prints (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      data TEXT NOT NULL,
      cost_inputs TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    )
  `);
}

/** PostgreSQL backend. Pass an explicit connection string, or omit to read DATABASE_URL. */
export function createPostgresStore(connectionString?: string): DataStore {
  const resolvedConnectionString = connectionString ?? process.env.DATABASE_URL;
  if (!resolvedConnectionString) {
    throw new Error(
      "Keine Postgres-Verbindung konfiguriert (Einstellungen > Datenbank oder DATABASE_URL)."
    );
  }
  const pool = new Pool({ connectionString: resolvedConnectionString });
  const ready = ensureSchema(pool);

  async function getSettings(): Promise<AppSettings> {
    await ready;
    const { rows } = await pool.query<{ data: string }>("SELECT data FROM settings WHERE id = 1");
    if (rows.length === 0) {
      await saveSettings(defaultSettings);
      return defaultSettings;
    }
    return migrateSettings(JSON.parse(rows[0].data));
  }

  async function saveSettings(settings: AppSettings): Promise<void> {
    await ready;
    await pool.query(
      `INSERT INTO settings (id, data) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [JSON.stringify(settings)]
    );
  }

  async function insertPrint(print: ParsedPrint): Promise<void> {
    await ready;
    await pool.query(
      "INSERT INTO prints (id, file_name, created_at, data) VALUES ($1, $2, $3, $4)",
      [print.id, print.fileName, print.createdAt, JSON.stringify(print)]
    );
  }

  async function savePrint(print: ParsedPrint): Promise<void> {
    await ready;
    await pool.query("UPDATE prints SET file_name = $1, data = $2 WHERE id = $3", [
      print.fileName,
      JSON.stringify(print),
      print.id,
    ]);
  }

  async function listPrints(): Promise<ParsedPrint[]> {
    await ready;
    const { rows } = await pool.query<{ data: string }>(
      "SELECT data FROM prints ORDER BY created_at DESC"
    );
    return rows.map((r) => JSON.parse(r.data) as ParsedPrint);
  }

  async function getPrint(id: string): Promise<ParsedPrint | null> {
    await ready;
    const { rows } = await pool.query<{ data: string }>(
      "SELECT data FROM prints WHERE id = $1",
      [id]
    );
    return rows[0] ? (JSON.parse(rows[0].data) as ParsedPrint) : null;
  }

  async function deletePrint(id: string): Promise<void> {
    await ready;
    await pool.query("DELETE FROM prints WHERE id = $1", [id]);
  }

  async function getPrintCostInputs(id: string): Promise<PrintCostInputs | null> {
    await ready;
    const { rows } = await pool.query<{ cost_inputs: string | null }>(
      "SELECT cost_inputs FROM prints WHERE id = $1",
      [id]
    );
    return rows[0]?.cost_inputs ? (JSON.parse(rows[0].cost_inputs) as PrintCostInputs) : null;
  }

  async function savePrintCostInputs(id: string, inputs: PrintCostInputs): Promise<void> {
    await ready;
    await pool.query("UPDATE prints SET cost_inputs = $1 WHERE id = $2", [
      JSON.stringify(inputs),
      id,
    ]);
  }

  async function updatePrintName(id: string, displayName: string): Promise<void> {
    await ready;
    const print = await getPrint(id);
    if (!print) throw new Error("Druck nicht gefunden.");
    await pool.query("UPDATE prints SET file_name = $1, data = $2 WHERE id = $3", [
      displayName,
      JSON.stringify({ ...print, displayName }),
      id,
    ]);
  }

  return {
    getSettings,
    saveSettings,
    insertPrint,
    savePrint,
    listPrints,
    getPrint,
    updatePrintName,
    deletePrint,
    getPrintCostInputs,
    savePrintCostInputs,
  };
}
