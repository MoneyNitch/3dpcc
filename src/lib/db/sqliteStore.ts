import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { AppSettings, ParsedPrint, PrintCostInputs } from "../types";
import { defaultSettings, migrateSettings, type DataStore } from "./shared";

function openDb(): Database.Database {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbFile = path.join(dataDir, "3d-pcc.db");
  const legacyDbFile = path.join(dataDir, "filarechner.db");
  // Migrate data from the previous project name (Filarechner) if present.
  if (!fs.existsSync(dbFile) && fs.existsSync(legacyDbFile)) {
    fs.renameSync(legacyDbFile, dbFile);
    for (const ext of ["-shm", "-wal"]) {
      if (fs.existsSync(legacyDbFile + ext)) fs.renameSync(legacyDbFile + ext, dbFile + ext);
    }
  }
  const db = new Database(dbFile);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS prints (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      data TEXT NOT NULL,
      cost_inputs TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );
  `);
  return db;
}

/** Local, file-based backend — no external server required. */
export function createSqliteStore(): DataStore {
  const db = openDb();

  async function getSettings(): Promise<AppSettings> {
    const row = db.prepare("SELECT data FROM settings WHERE id = 1").get() as
      | { data: string }
      | undefined;
    if (!row) {
      await saveSettings(defaultSettings);
      return defaultSettings;
    }
    return migrateSettings(JSON.parse(row.data));
  }

  async function saveSettings(settings: AppSettings): Promise<void> {
    db.prepare(
      "INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data"
    ).run(JSON.stringify(settings));
  }

  async function insertPrint(print: ParsedPrint): Promise<void> {
    db.prepare("INSERT INTO prints (id, file_name, created_at, data) VALUES (?, ?, ?, ?)").run(
      print.id,
      print.fileName,
      print.createdAt,
      JSON.stringify(print)
    );
  }

  async function listPrints(): Promise<ParsedPrint[]> {
    const rows = db
      .prepare("SELECT data FROM prints ORDER BY created_at DESC")
      .all() as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as ParsedPrint);
  }

  async function getPrint(id: string): Promise<ParsedPrint | null> {
    const row = db.prepare("SELECT data FROM prints WHERE id = ?").get(id) as
      | { data: string }
      | undefined;
    return row ? (JSON.parse(row.data) as ParsedPrint) : null;
  }

  async function deletePrint(id: string): Promise<void> {
    db.prepare("DELETE FROM prints WHERE id = ?").run(id);
  }

  async function getPrintCostInputs(id: string): Promise<PrintCostInputs | null> {
    const row = db.prepare("SELECT cost_inputs FROM prints WHERE id = ?").get(id) as
      | { cost_inputs: string | null }
      | undefined;
    return row?.cost_inputs ? (JSON.parse(row.cost_inputs) as PrintCostInputs) : null;
  }

  async function savePrintCostInputs(id: string, inputs: PrintCostInputs): Promise<void> {
    db.prepare("UPDATE prints SET cost_inputs = ? WHERE id = ?").run(
      JSON.stringify(inputs),
      id
    );
  }

  return {
    getSettings,
    saveSettings,
    insertPrint,
    listPrints,
    getPrint,
    deletePrint,
    getPrintCostInputs,
    savePrintCostInputs,
  };
}
