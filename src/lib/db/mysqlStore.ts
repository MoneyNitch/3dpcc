import mysql from "mysql2/promise";
import type { AccessoryStockMovement, AppSettings, MaterialBooking, ParsedPrint, PrintCostInputs, PrintOrder } from "../types";
import { defaultSettings, materialBookingActiveKey, migrateSettings, preserveAccessoryStock, PrintLinkedToOrderError, printModelKey, type ApplicationDataSnapshot, type DataStore } from "./shared";

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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS print_models (
      id VARCHAR(64) PRIMARY KEY,
      data LONGBLOB NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(64) PRIMARY KEY,
      updated_at VARCHAR(64) NOT NULL,
      data LONGTEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      order_id VARCHAR(64) NOT NULL,
      print_id VARCHAR(64) NOT NULL,
      quantity INT NOT NULL,
      PRIMARY KEY (order_id, print_id),
      CONSTRAINT order_items_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT order_items_print_fk FOREIGN KEY (print_id) REFERENCES prints(id) ON DELETE RESTRICT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS material_bookings (
      id VARCHAR(64) PRIMARY KEY,
      print_id VARCHAR(64) NOT NULL,
      created_at VARCHAR(64) NOT NULL,
      active_key VARCHAR(64) UNIQUE,
      data LONGTEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accessory_stock_movements (
      id VARCHAR(64) PRIMARY KEY,
      accessory_id VARCHAR(100) NOT NULL,
      created_at VARCHAR(64) NOT NULL,
      reference_key VARCHAR(255) UNIQUE,
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
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT data FROM settings WHERE id = 1 FOR UPDATE"
      );
      const next = rows[0] ? preserveAccessoryStock(settings, migrateSettings(JSON.parse(rows[0].data))) : settings;
      await connection.query(
        "INSERT INTO settings (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)",
        [JSON.stringify(next)]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
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

  async function savePrintModel(id: string, model: Buffer, plateIndex?: number): Promise<void> {
    await ready;
    await pool.query(
      "INSERT INTO print_models (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)",
      [printModelKey(id, plateIndex), model]
    );
  }

  async function getPrintModel(id: string, plateIndex?: number): Promise<Buffer | null> {
    await ready;
    const [rows] = await pool.query<mysql.RowDataPacket[]>("SELECT data FROM print_models WHERE id = ?", [printModelKey(id, plateIndex)]);
    return (rows[0]?.data as Buffer | undefined) ?? null;
  }

  async function listPrintModels(id: string): Promise<{ plateIndex: number | null; model: Buffer }[]> {
    await ready;
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT id, data FROM print_models WHERE id = ? OR id LIKE ?",
      [id, `${id}:%`]
    );
    return rows.map((row) => ({
      plateIndex: row.id === id ? null : Number(String(row.id).slice(id.length + 1)),
      model: row.data as Buffer,
    })).filter((row) => row.plateIndex === null || Number.isSafeInteger(row.plateIndex));
  }

  async function deletePrint(id: string): Promise<void> {
    await ready;
    try {
      await pool.query("DELETE FROM prints WHERE id = ?", [id]);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ER_ROW_IS_REFERENCED_2") {
        throw new PrintLinkedToOrderError("Drucke, die einem Auftrag zugeordnet sind, können nicht gelöscht werden.");
      }
      throw error;
    }
    await pool.query("DELETE FROM print_models WHERE id = ? OR id LIKE ?", [id, `${id}:%`]);
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

  async function listOrders(): Promise<PrintOrder[]> {
    await ready;
    const [rows] = await pool.query<mysql.RowDataPacket[]>("SELECT data FROM orders ORDER BY updated_at DESC");
    return rows.map((row) => JSON.parse(row.data) as PrintOrder);
  }

  async function saveOrder(order: PrintOrder): Promise<void> {
    await ready;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        "INSERT INTO orders (id, updated_at, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at), data = VALUES(data)",
        [order.id, order.updatedAt, JSON.stringify(order)]
      );
      await connection.query("DELETE FROM order_items WHERE order_id = ?", [order.id]);
      for (const item of order.items) {
        await connection.query("INSERT INTO order_items (order_id, print_id, quantity) VALUES (?, ?, ?)", [
          order.id, item.printId, item.quantity,
        ]);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function saveOrderQueue(orders: PrintOrder[]): Promise<void> {
    await ready;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const order of orders) {
        const [result] = await connection.query<mysql.ResultSetHeader>(
          "UPDATE orders SET updated_at = ?, data = ? WHERE id = ?",
          [order.updatedAt, JSON.stringify(order), order.id]
        );
        if (result.affectedRows !== 1) throw new Error("Auftrag nicht gefunden.");
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function deleteOrder(id: string): Promise<void> {
    await ready;
    await pool.query("DELETE FROM orders WHERE id = ?", [id]);
  }

  async function listMaterialBookings(printId?: string): Promise<MaterialBooking[]> {
    await ready;
    const [rows] = printId
      ? await pool.query<mysql.RowDataPacket[]>("SELECT data FROM material_bookings WHERE print_id = ? ORDER BY created_at DESC", [printId])
      : await pool.query<mysql.RowDataPacket[]>("SELECT data FROM material_bookings ORDER BY created_at DESC");
    return rows.map((row) => JSON.parse(row.data) as MaterialBooking);
  }

  async function createMaterialBooking(booking: MaterialBooking, activeKey: string | null): Promise<boolean> {
    await ready;
    const [result] = await pool.query<mysql.ResultSetHeader>(
      "INSERT INTO material_bookings (id, print_id, created_at, active_key, data) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id",
      [booking.id, booking.printId, booking.createdAt, activeKey, JSON.stringify(booking)]
    );
    return result.affectedRows === 1;
  }

  async function saveMaterialBooking(booking: MaterialBooking, activeKey: string | null): Promise<void> {
    await ready;
    const [result] = await pool.query<mysql.ResultSetHeader>(
      "UPDATE material_bookings SET active_key = ?, data = ? WHERE id = ?",
      [activeKey, JSON.stringify(booking), booking.id]
    );
    if (result.affectedRows !== 1) throw new Error("Materialbuchung nicht gefunden.");
  }

  async function listAccessoryStockMovements(): Promise<AccessoryStockMovement[]> {
    await ready;
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT data FROM accessory_stock_movements ORDER BY created_at DESC"
    );
    return rows.map((row) => JSON.parse(row.data) as AccessoryStockMovement);
  }

  async function applyAccessoryStockMovements(
    movements: AccessoryStockMovement[],
  ): Promise<"applied" | "duplicate" | "insufficient" | "limit" | "not_found"> {
    await ready;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT data FROM settings WHERE id = 1 FOR UPDATE"
      );
      if (!rows[0]) {
        await connection.rollback();
        return "not_found";
      }

      const settings = migrateSettings(JSON.parse(rows[0].data));
      const items = new Map(settings.accessoryMaterials.map((item) => [item.id, item]));
      if (movements.some((movement) => !items.has(movement.accessoryId))) {
        await connection.rollback();
        return "not_found";
      }
      const keys = movements.flatMap((movement) => movement.referenceKey ? [movement.referenceKey] : []);
      if (keys.length) {
        const [duplicates] = await connection.query<mysql.RowDataPacket[]>(
          `SELECT 1 FROM accessory_stock_movements WHERE reference_key IN (${keys.map(() => "?").join(",")}) LIMIT 1`,
          keys
        );
        if (duplicates.length) {
          await connection.rollback();
          return "duplicate";
        }
      }
      const deltas = new Map<string, number>();
      for (const movement of movements) {
        deltas.set(movement.accessoryId, (deltas.get(movement.accessoryId) ?? 0) + movement.quantity);
      }
      if ([...deltas].some(([id, delta]) => (items.get(id)?.stockQuantity ?? 0) + delta < 0)) {
        await connection.rollback();
        return "insufficient";
      }
      if ([...deltas].some(([id, delta]) => (items.get(id)?.stockQuantity ?? 0) + delta > 1_000_000_000)) {
        await connection.rollback();
        return "limit";
      }
      const updatedSettings: AppSettings = {
        ...settings,
        accessoryMaterials: settings.accessoryMaterials.map((item) => ({
          ...item,
          stockQuantity: item.stockQuantity + (deltas.get(item.id) ?? 0),
        })),
      };
      await connection.query("UPDATE settings SET data = ? WHERE id = 1", [JSON.stringify(updatedSettings)]);
      for (const movement of movements) {
        await connection.query(
          "INSERT INTO accessory_stock_movements (id, accessory_id, created_at, reference_key, data) VALUES (?, ?, ?, ?, ?)",
          [movement.id, movement.accessoryId, movement.createdAt, movement.referenceKey, JSON.stringify(movement)]
        );
      }
      await connection.commit();
      return "applied";
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function importAccessoryStockMovements(movements: AccessoryStockMovement[]): Promise<void> {
    await ready;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const movement of movements) {
        await connection.query(
          "INSERT INTO accessory_stock_movements (id, accessory_id, created_at, reference_key, data) VALUES (?, ?, ?, ?, ?)",
          [movement.id, movement.accessoryId, movement.createdAt, movement.referenceKey, JSON.stringify(movement)]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function replaceApplicationData(data: ApplicationDataSnapshot): Promise<void> {
    await ready;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("DELETE FROM print_models");
      await connection.query("DELETE FROM order_items");
      await connection.query("DELETE FROM material_bookings");
      await connection.query("DELETE FROM accessory_stock_movements");
      await connection.query("DELETE FROM prints");
      await connection.query("DELETE FROM orders");
      await connection.query("DELETE FROM settings");
      await connection.query("INSERT INTO settings (id, data) VALUES (1, ?)", [JSON.stringify(data.settings)]);
      for (const entry of data.prints) {
        await connection.query(
          "INSERT INTO prints (id, file_name, created_at, data, cost_inputs) VALUES (?, ?, ?, ?, ?)",
          [entry.print.id, entry.print.fileName, entry.print.createdAt, JSON.stringify(entry.print),
            entry.costInputs ? JSON.stringify(entry.costInputs) : null]
        );
        for (const model of entry.models) {
          await connection.query("INSERT INTO print_models (id, data) VALUES (?, ?)", [
            printModelKey(entry.print.id, model.plateIndex ?? undefined), model.model,
          ]);
        }
      }
      for (const order of data.orders) {
        await connection.query("INSERT INTO orders (id, updated_at, data) VALUES (?, ?, ?)", [
          order.id, order.updatedAt, JSON.stringify(order),
        ]);
        for (const item of order.items) {
          await connection.query("INSERT INTO order_items (order_id, print_id, quantity) VALUES (?, ?, ?)", [
            order.id, item.printId, item.quantity,
          ]);
        }
        for (const booking of data.materialBookings) {
          await connection.query(
            "INSERT INTO material_bookings (id, print_id, created_at, active_key, data) VALUES (?, ?, ?, ?, ?)",
            [booking.id, booking.printId, booking.createdAt, materialBookingActiveKey(booking), JSON.stringify(booking)]
          );
        }
      }
      for (const movement of data.accessoryStockMovements) {
        await connection.query(
          "INSERT INTO accessory_stock_movements (id, accessory_id, created_at, reference_key, data) VALUES (?, ?, ?, ?, ?)",
          [movement.id, movement.accessoryId, movement.createdAt, movement.referenceKey, JSON.stringify(movement)]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
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
