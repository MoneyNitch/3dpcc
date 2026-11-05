import { Pool } from "pg";
import type { AppSettings, ParsedPrint, PrintCostInputs, PrintOrder } from "../types";
import { defaultSettings, migrateSettings, PrintLinkedToOrderError, printModelKey, type ApplicationDataSnapshot, type DataStore } from "./shared";

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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS print_models (
      id TEXT PRIMARY KEY,
      data BYTEA NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL,
      data TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      print_id TEXT NOT NULL REFERENCES prints(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL,
      PRIMARY KEY (order_id, print_id)
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

  async function savePrintModel(id: string, model: Buffer, plateIndex?: number): Promise<void> {
    await ready;
    await pool.query(
      "INSERT INTO print_models (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
      [printModelKey(id, plateIndex), model]
    );
  }

  async function getPrintModel(id: string, plateIndex?: number): Promise<Buffer | null> {
    await ready;
    const { rows } = await pool.query<{ data: Buffer }>("SELECT data FROM print_models WHERE id = $1", [printModelKey(id, plateIndex)]);
    return rows[0]?.data ?? null;
  }

  async function listPrintModels(id: string): Promise<{ plateIndex: number | null; model: Buffer }[]> {
    await ready;
    const { rows } = await pool.query<{ id: string; data: Buffer }>(
      "SELECT id, data FROM print_models WHERE id = $1 OR id LIKE $2",
      [id, `${id}:%`]
    );
    return rows.map((row) => ({
      plateIndex: row.id === id ? null : Number(row.id.slice(id.length + 1)),
      model: row.data,
    })).filter((row) => row.plateIndex === null || Number.isSafeInteger(row.plateIndex));
  }

  async function deletePrint(id: string): Promise<void> {
    await ready;
    try {
      await pool.query("DELETE FROM prints WHERE id = $1", [id]);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23503") {
        throw new PrintLinkedToOrderError("Drucke, die einem Auftrag zugeordnet sind, können nicht gelöscht werden.");
      }
      throw error;
    }
    await pool.query("DELETE FROM print_models WHERE id = $1 OR id LIKE $2", [id, `${id}:%`]);
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

  async function listOrders(): Promise<PrintOrder[]> {
    await ready;
    const { rows } = await pool.query<{ data: string }>("SELECT data FROM orders ORDER BY updated_at DESC");
    return rows.map((row) => JSON.parse(row.data) as PrintOrder);
  }

  async function saveOrder(order: PrintOrder): Promise<void> {
    await ready;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO orders (id, updated_at, data) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at, data = EXCLUDED.data`,
        [order.id, order.updatedAt, JSON.stringify(order)]
      );
      await client.query("DELETE FROM order_items WHERE order_id = $1", [order.id]);
      for (const item of order.items) {
        await client.query("INSERT INTO order_items (order_id, print_id, quantity) VALUES ($1, $2, $3)", [
          order.id, item.printId, item.quantity,
        ]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function deleteOrder(id: string): Promise<void> {
    await ready;
    await pool.query("DELETE FROM orders WHERE id = $1", [id]);
  }

  async function replaceApplicationData(data: ApplicationDataSnapshot): Promise<void> {
    await ready;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM print_models");
      await client.query("DELETE FROM order_items");
      await client.query("DELETE FROM prints");
      await client.query("DELETE FROM orders");
      await client.query("DELETE FROM settings");
      await client.query("INSERT INTO settings (id, data) VALUES (1, $1)", [JSON.stringify(data.settings)]);
      for (const entry of data.prints) {
        await client.query(
          "INSERT INTO prints (id, file_name, created_at, data, cost_inputs) VALUES ($1, $2, $3, $4, $5)",
          [entry.print.id, entry.print.fileName, entry.print.createdAt, JSON.stringify(entry.print),
            entry.costInputs ? JSON.stringify(entry.costInputs) : null]
        );
        for (const model of entry.models) {
          await client.query("INSERT INTO print_models (id, data) VALUES ($1, $2)", [
            printModelKey(entry.print.id, model.plateIndex ?? undefined), model.model,
          ]);
        }
      }
      for (const order of data.orders) {
        await client.query("INSERT INTO orders (id, updated_at, data) VALUES ($1, $2, $3)", [
          order.id, order.updatedAt, JSON.stringify(order),
        ]);
        for (const item of order.items) {
          await client.query("INSERT INTO order_items (order_id, print_id, quantity) VALUES ($1, $2, $3)", [
            order.id, item.printId, item.quantity,
          ]);
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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
