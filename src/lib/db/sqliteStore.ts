import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { AppSettings, ParsedPrint, PrintCostInputs, PrintOrder } from "../types";
import { defaultSettings, migrateSettings, PrintLinkedToOrderError, printModelKey, type ApplicationDataSnapshot, type DataStore } from "./shared";

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
  db.pragma("foreign_keys = ON");
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
    CREATE TABLE IF NOT EXISTS print_models (
      id TEXT PRIMARY KEY,
      data BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_items (
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      print_id TEXT NOT NULL REFERENCES prints(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL,
      PRIMARY KEY (order_id, print_id)
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

  async function savePrint(print: ParsedPrint): Promise<void> {
    db.prepare("UPDATE prints SET file_name = ?, data = ? WHERE id = ?").run(
      print.fileName,
      JSON.stringify(print),
      print.id
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

  async function savePrintModel(id: string, model: Buffer, plateIndex?: number): Promise<void> {
    db.prepare("INSERT INTO print_models (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data").run(printModelKey(id, plateIndex), model);
  }

  async function getPrintModel(id: string, plateIndex?: number): Promise<Buffer | null> {
    const row = db.prepare("SELECT data FROM print_models WHERE id = ?").get(printModelKey(id, plateIndex)) as
      | { data: Buffer }
      | undefined;
    return row?.data ?? null;
  }

  async function listPrintModels(id: string): Promise<{ plateIndex: number | null; model: Buffer }[]> {
    const rows = db.prepare("SELECT id, data FROM print_models WHERE id = ? OR id LIKE ?").all(id, `${id}:%`) as
      { id: string; data: Buffer }[];
    return rows.map((row) => ({
      plateIndex: row.id === id ? null : Number(row.id.slice(id.length + 1)),
      model: row.data,
    })).filter((row) => row.plateIndex === null || Number.isSafeInteger(row.plateIndex));
  }

  async function updatePrintName(id: string, displayName: string): Promise<void> {
    const print = await getPrint(id);
    if (!print) throw new Error("Druck nicht gefunden.");
    db.prepare("UPDATE prints SET file_name = ?, data = ? WHERE id = ?").run(
      displayName,
      JSON.stringify({ ...print, displayName }),
      id
    );
  }

  async function deletePrint(id: string): Promise<void> {
    db.transaction(() => {
      if (db.prepare("SELECT 1 FROM order_items WHERE print_id = ? LIMIT 1").get(id)) {
        throw new PrintLinkedToOrderError("Drucke, die einem Auftrag zugeordnet sind, können nicht gelöscht werden.");
      }
      db.prepare("DELETE FROM prints WHERE id = ?").run(id);
      db.prepare("DELETE FROM print_models WHERE id = ? OR id LIKE ?").run(id, `${id}:%`);
    }).immediate();
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

  async function listOrders(): Promise<PrintOrder[]> {
    return (db.prepare("SELECT data FROM orders ORDER BY updated_at DESC").all() as { data: string }[])
      .map((row) => JSON.parse(row.data) as PrintOrder);
  }

  async function saveOrder(order: PrintOrder): Promise<void> {
    db.transaction(() => {
      db.prepare(
        "INSERT INTO orders (id, updated_at, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data"
      ).run(order.id, order.updatedAt, JSON.stringify(order));
      db.prepare("DELETE FROM order_items WHERE order_id = ?").run(order.id);
      const itemStatement = db.prepare("INSERT INTO order_items (order_id, print_id, quantity) VALUES (?, ?, ?)");
      for (const item of order.items) itemStatement.run(order.id, item.printId, item.quantity);
    }).immediate();
  }

  async function deleteOrder(id: string): Promise<void> {
    db.prepare("DELETE FROM orders WHERE id = ?").run(id);
  }

  async function replaceApplicationData(data: ApplicationDataSnapshot): Promise<void> {
    const replace = db.transaction(() => {
      db.exec("DELETE FROM order_items; DELETE FROM print_models; DELETE FROM prints; DELETE FROM orders; DELETE FROM settings;");
      db.prepare("INSERT INTO settings (id, data) VALUES (1, ?)").run(JSON.stringify(data.settings));
      const printStatement = db.prepare(
        "INSERT INTO prints (id, file_name, created_at, data, cost_inputs) VALUES (?, ?, ?, ?, ?)"
      );
      const modelStatement = db.prepare("INSERT INTO print_models (id, data) VALUES (?, ?)");
      for (const entry of data.prints) {
        printStatement.run(
          entry.print.id,
          entry.print.fileName,
          entry.print.createdAt,
          JSON.stringify(entry.print),
          entry.costInputs ? JSON.stringify(entry.costInputs) : null,
        );
        for (const model of entry.models) {
          modelStatement.run(printModelKey(entry.print.id, model.plateIndex ?? undefined), model.model);
        }
      }
      const orderStatement = db.prepare("INSERT INTO orders (id, updated_at, data) VALUES (?, ?, ?)");
      const orderItemStatement = db.prepare("INSERT INTO order_items (order_id, print_id, quantity) VALUES (?, ?, ?)");
      for (const order of data.orders) {
        orderStatement.run(order.id, order.updatedAt, JSON.stringify(order));
        for (const item of order.items) orderItemStatement.run(order.id, item.printId, item.quantity);
      }
    });
    replace.immediate();
  }

  return {
    getSettings,
    saveSettings,
    insertPrint,
    savePrint,
    listPrints,
    getPrint,
    savePrintModel,
    getPrintModel,
    listPrintModels,
    updatePrintName,
    deletePrint,
    getPrintCostInputs,
    savePrintCostInputs,
    listOrders,
    saveOrder,
    deleteOrder,
    replaceApplicationData,
  };
}
