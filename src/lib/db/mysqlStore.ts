import mysql from "mysql2/promise";
import type { AppSettings, ParsedPrint, PrintCostInputs } from "../types";
import { defaultSettings, migrateSettings, type DataStore } from "./shared";

async function ensureSchema(pool: mysql.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prints (
      id VARCHAR(64) PRIMARY KEY,
      file_name TEXT NOT NULL,
      created_at VARCHAR(64) NOT NULL,
      data LONGTEXT NOT NULL,
      cost_inputs LONGTEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INT PRIMARY KEY,
      data LONGTEXT NOT NULL
    )
  `);
}

/** MySQL / MariaDB backend. Pass an explicit connection string, or omit to read DATABASE_URL. */
export function createMysqlStore(connectionString?: string): DataStore {
  const resolvedConnectionString = connectionString ?? process.env.DATABASE_URL;
  if (!resolvedConnectionString) {
    throw new Error(
      "Keine MySQL/MariaDB-Verbindung konfiguriert (Einstellungen > Datenbank oder DATABASE_URL)."
    );
  }
  const pool = mysql.createPool(resolvedConnectionString);
  const ready = ensureSchema(pool);

  async function getSettings(): Promise<AppSettings> {
    await ready;
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT data FROM settings WHERE id = 1"
    );
    if (rows.length === 0) {
      await saveSettings(defaultSettings);
      return defaultSettings;
    }
    return migrateSettings(JSON.parse(rows[0].data));
  }

  async function saveSettings(settings: AppSettings): Promise<void> {
    await ready;
    await pool.query(
      "INSERT INTO settings (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)",
      [JSON.stringify(settings)]
    );
  }

  async function insertPrint(print: ParsedPrint): Promise<void> {
    await ready;
    await pool.query(
      "INSERT INTO prints (id, file_name, created_at, data) VALUES (?, ?, ?, ?)",
      [print.id, print.fileName, print.createdAt, JSON.stringify(print)]
    );
  }

  async function savePrint(print: ParsedPrint): Promise<void> {
    await ready;
    await pool.query("UPDATE prints SET file_name = ?, data = ? WHERE id = ?", [
      print.fileName,
      JSON.stringify(print),
      print.id,
    ]);
  }

  async function listPrints(): Promise<ParsedPrint[]> {
    await ready;
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT data FROM prints ORDER BY created_at DESC"
    );
    return rows.map((r) => JSON.parse(r.data) as ParsedPrint);
  }

  async function getPrint(id: string): Promise<ParsedPrint | null> {
    await ready;
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT data FROM prints WHERE id = ?",
      [id]
    );
    return rows[0] ? (JSON.parse(rows[0].data) as ParsedPrint) : null;
  }

  async function deletePrint(id: string): Promise<void> {
    await ready;
    await pool.query("DELETE FROM prints WHERE id = ?", [id]);
  }

  async function getPrintCostInputs(id: string): Promise<PrintCostInputs | null> {
    await ready;
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT cost_inputs FROM prints WHERE id = ?",
      [id]
    );
    return rows[0]?.cost_inputs ? (JSON.parse(rows[0].cost_inputs) as PrintCostInputs) : null;
  }

  async function savePrintCostInputs(id: string, inputs: PrintCostInputs): Promise<void> {
    await ready;
    await pool.query("UPDATE prints SET cost_inputs = ? WHERE id = ?", [
      JSON.stringify(inputs),
      id,
    ]);
  }

  async function updatePrintName(id: string, displayName: string): Promise<void> {
    await ready;
    const print = await getPrint(id);
    if (!print) throw new Error("Druck nicht gefunden.");
    await pool.query("UPDATE prints SET file_name = ?, data = ? WHERE id = ?", [
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
