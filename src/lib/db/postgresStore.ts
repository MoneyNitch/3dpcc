import { Pool } from "pg";
import type { AccessoryStockMovement, AppSettings, Customer, MaterialBooking, ParsedPrint, PrintCostInputs, PrintOrder } from "../types";
import { defaultSettings, materialBookingActiveKey, migrateSettings, preserveAccessoryStock, PrintLinkedToOrderError, printModelKey, type ApplicationDataSnapshot, type DataStore } from "./shared";

async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query("CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL)");
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS material_bookings (
      id TEXT PRIMARY KEY,
      print_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      active_key TEXT UNIQUE,
      data TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accessory_stock_movements (
      id TEXT PRIMARY KEY,
      accessory_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      reference_key TEXT UNIQUE,
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

  async function updateSettings(update: (current: AppSettings) => AppSettings): Promise<AppSettings> {
    await ready;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ data: string }>("SELECT data FROM settings WHERE id = 1 FOR UPDATE");
      const next = update(rows[0] ? migrateSettings(JSON.parse(rows[0].data)) : structuredClone(defaultSettings));
      await client.query(
        `INSERT INTO settings (id, data) VALUES (1, $1)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
        [JSON.stringify(next)]
      );
      await client.query("COMMIT");
      return next;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

  }

  async function saveSettings(settings: AppSettings, preserveManaged = false): Promise<void> {
    await updateSettings((current) => preserveManaged
      ? { ...settings, nextAccessoryNumber: current.nextAccessoryNumber, accessoryMaterials: current.accessoryMaterials, labelTemplates: current.labelTemplates, productTypes: current.productTypes }
      : preserveAccessoryStock(settings, current));
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

  async function saveOrder(order: PrintOrder, expectedUpdatedAt?: string): Promise<boolean> {
    await ready;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (expectedUpdatedAt) {
        const result = await client.query("UPDATE orders SET updated_at = $1, data = $2 WHERE id = $3 AND updated_at = $4",
          [order.updatedAt, JSON.stringify(order), order.id, expectedUpdatedAt]);
        if (result.rowCount !== 1) {
          await client.query("ROLLBACK");
          return false;
        }
      } else await client.query(
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
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function saveOrderQueue(orders: PrintOrder[]): Promise<void> {
    await ready;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const order of orders) {
        const result = await client.query(
          "UPDATE orders SET updated_at = $1, data = $2 WHERE id = $3",
          [order.updatedAt, JSON.stringify(order), order.id]
        );
        if (result.rowCount !== 1) throw new Error("Auftrag nicht gefunden.");
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

  async function listMaterialBookings(printId?: string): Promise<MaterialBooking[]> {
    await ready;
    const { rows } = printId
      ? await pool.query<{ data: string }>("SELECT data FROM material_bookings WHERE print_id = $1 ORDER BY created_at DESC", [printId])
      : await pool.query<{ data: string }>("SELECT data FROM material_bookings ORDER BY created_at DESC");
    return rows.map((row) => JSON.parse(row.data) as MaterialBooking);
  }

  async function createMaterialBooking(booking: MaterialBooking, activeKey: string | null): Promise<boolean> {
    await ready;
    const { rowCount } = await pool.query(
      "INSERT INTO material_bookings (id, print_id, created_at, active_key, data) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
      [booking.id, booking.printId, booking.createdAt, activeKey, JSON.stringify(booking)]
    );
    return rowCount === 1;
  }

  async function saveMaterialBooking(booking: MaterialBooking, activeKey: string | null): Promise<void> {
    await ready;
    const { rowCount } = await pool.query(
      "UPDATE material_bookings SET active_key = $1, data = $2 WHERE id = $3",
      [activeKey, JSON.stringify(booking), booking.id]
    );
    if (rowCount !== 1) throw new Error("Materialbuchung nicht gefunden.");
  }

  async function listAccessoryStockMovements(): Promise<AccessoryStockMovement[]> {
    await ready;
    const { rows } = await pool.query<{ data: string }>(
      "SELECT data FROM accessory_stock_movements ORDER BY created_at DESC"
    );
    return rows.map((row) => JSON.parse(row.data) as AccessoryStockMovement);
  }

  async function applyAccessoryStockMovements(
    movements: AccessoryStockMovement[],
  ): Promise<"applied" | "duplicate" | "insufficient" | "limit" | "not_found"> {
    await ready;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ data: string }>("SELECT data FROM settings WHERE id = 1 FOR UPDATE");
      if (!rows[0]) {
        await client.query("ROLLBACK");
        return "not_found";
      }

      const settings = migrateSettings(JSON.parse(rows[0].data));
      const items = new Map(settings.accessoryMaterials.map((item) => [item.id, item]));
      if (movements.some((movement) => !items.has(movement.accessoryId))) {
        await client.query("ROLLBACK");
        return "not_found";
      }
      const keys = movements.flatMap((movement) => movement.referenceKey ? [movement.referenceKey] : []);
      if (keys.length) {
        const duplicate = await client.query(
          "SELECT 1 FROM accessory_stock_movements WHERE reference_key = ANY($1)",
          [keys]
        );
        if (duplicate.rowCount) {
          await client.query("ROLLBACK");
          return "duplicate";
        }
      }
      const deltas = new Map<string, number>();
      for (const movement of movements) {
        deltas.set(movement.accessoryId, (deltas.get(movement.accessoryId) ?? 0) + movement.quantity);
      }
      if ([...deltas].some(([id, delta]) => (items.get(id)?.stockQuantity ?? 0) + delta < 0)) {
        await client.query("ROLLBACK");
        return "insufficient";
      }
      if ([...deltas].some(([id, delta]) => (items.get(id)?.stockQuantity ?? 0) + delta > 1_000_000_000)) {
        await client.query("ROLLBACK");
        return "limit";
      }
      const updatedSettings: AppSettings = {
        ...settings,
        accessoryMaterials: settings.accessoryMaterials.map((item) => ({
          ...item,
          stockQuantity: item.stockQuantity + (deltas.get(item.id) ?? 0),
        })),
      };
      await client.query("UPDATE settings SET data = $1 WHERE id = 1", [JSON.stringify(updatedSettings)]);
      for (const movement of movements) {
        await client.query(
          "INSERT INTO accessory_stock_movements (id, accessory_id, created_at, reference_key, data) VALUES ($1, $2, $3, $4, $5)",
          [movement.id, movement.accessoryId, movement.createdAt, movement.referenceKey, JSON.stringify(movement)]
        );
      }
      await client.query("COMMIT");
      return "applied";
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function importAccessoryStockMovements(movements: AccessoryStockMovement[]): Promise<void> {
    await ready;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const movement of movements) {
        await client.query(
          "INSERT INTO accessory_stock_movements (id, accessory_id, created_at, reference_key, data) VALUES ($1, $2, $3, $4, $5)",
          [movement.id, movement.accessoryId, movement.createdAt, movement.referenceKey, JSON.stringify(movement)]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function replaceApplicationData(data: ApplicationDataSnapshot): Promise<void> {
    await ready;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM print_models");
      await client.query("DELETE FROM order_items");
      await client.query("DELETE FROM material_bookings");
      await client.query("DELETE FROM accessory_stock_movements");
      await client.query("DELETE FROM prints");
      await client.query("DELETE FROM orders");
      await client.query("DELETE FROM settings");
      await client.query("INSERT INTO settings (id, data) VALUES (1, $1)", [JSON.stringify(data.settings)]);
      await client.query("DELETE FROM customers");
      for (const customer of data.customers ?? []) {
        await client.query("INSERT INTO customers (id, updated_at, data) VALUES ($1, $2, $3)", [customer.id, customer.updatedAt, JSON.stringify(customer)]);
      }
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
        for (const booking of data.materialBookings) {
          await client.query(
            "INSERT INTO material_bookings (id, print_id, created_at, active_key, data) VALUES ($1, $2, $3, $4, $5)",
            [booking.id, booking.printId, booking.createdAt, materialBookingActiveKey(booking), JSON.stringify(booking)]
          );
        }
      }
      for (const movement of data.accessoryStockMovements) {
        await client.query(
          "INSERT INTO accessory_stock_movements (id, accessory_id, created_at, reference_key, data) VALUES ($1, $2, $3, $4, $5)",
          [movement.id, movement.accessoryId, movement.createdAt, movement.referenceKey, JSON.stringify(movement)]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function listCustomers(): Promise<Customer[]> {
    await ready;
    const { rows } = await pool.query<{ data: string }>("SELECT data FROM customers ORDER BY updated_at DESC");
    return rows.map((row) => JSON.parse(row.data) as Customer);
  }

  async function saveCustomer(customer: Customer, expectedUpdatedAt?: string): Promise<boolean> {
    await ready;
    const result = expectedUpdatedAt
      ? await pool.query("UPDATE customers SET updated_at = $1, data = $2 WHERE id = $3 AND updated_at = $4",
        [customer.updatedAt, JSON.stringify(customer), customer.id, expectedUpdatedAt])
      : await pool.query("INSERT INTO customers (id, updated_at, data) VALUES ($1, $2, $3) ON CONFLICT(id) DO NOTHING",
        [customer.id, customer.updatedAt, JSON.stringify(customer)]);
    return result.rowCount === 1;
  }

  return {
    updateSettings,
    listCustomers,
    saveCustomer,
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
    saveOrderQueue,
    deleteOrder,
    listMaterialBookings,
    createMaterialBooking,
    saveMaterialBooking,
    listAccessoryStockMovements,
    applyAccessoryStockMovements,
    importAccessoryStockMovements,
    replaceApplicationData,
  };
}
