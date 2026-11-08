import type { AccessoryStockMovement, AppSettings, MaterialBooking, ParsedPrint, PrintCostInputs, PrintOrder } from "../types";
import { resolveDbConnection, type ResolvedDbConnection } from "../dbConfig";
import { materialBookingActiveKey, type ApplicationDataSnapshot, type DataStore } from "./shared";
import { originalArchives } from "../originalArchives";
import { softwareUpdates } from "../softwareUpdates";

// The active backend is resolved from the DB config saved via Settings (data/db-config.json),
// falling back to DB_DRIVER/DATABASE_URL env vars if nothing was saved there yet.
const globalForStore = globalThis as unknown as { __filarechnerStore?: Promise<DataStore> };

function createStoreForConnection(resolved: ResolvedDbConnection): Promise<DataStore> {
  if (resolved.driver === "postgres") {
    return import("./postgresStore").then((m) => m.createPostgresStore(resolved.connectionString));
  }
  if (resolved.driver === "mysql") {
    return import("./mysqlStore").then((m) => m.createMysqlStore(resolved.connectionString));
  }
  return import("./sqliteStore").then((m) => m.createSqliteStore());
}

function createStore(): Promise<DataStore> {
  return createStoreForConnection(resolveDbConnection());
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
  await (await getStore()).saveSettings(settings);
  softwareUpdates.configure(settings.general);
}

export async function insertPrint(print: ParsedPrint): Promise<void> {
  return (await getStore()).insertPrint(print);
}

export async function savePrint(print: ParsedPrint): Promise<void> {
  return (await getStore()).savePrint(print);
}

export async function listPrints(): Promise<ParsedPrint[]> {
  return (await getStore()).listPrints();
}

export async function getPrint(id: string): Promise<ParsedPrint | null> {
  return (await getStore()).getPrint(id);
}

export async function savePrintModel(id: string, model: Buffer, plateIndex?: number): Promise<void> {
  const store = await getStore();
  await store.savePrintModel(id, model, plateIndex);
  if (plateIndex === undefined) return;

  const linkedPrints = (await store.listPrints()).filter(
    (print) => print.previewSource?.printId === id &&
      print.previewSource.plateIndex === plateIndex
  );
  for (const print of linkedPrints) {
    await store.savePrintModel(print.id, model, print.plate.plateIndex ?? plateIndex);
  }
}

export async function getPrintModel(id: string, plateIndex?: number): Promise<Buffer | null> {
  return (await getStore()).getPrintModel(id, plateIndex);
}

export async function listPrintModels(id: string): Promise<{ plateIndex: number | null; model: Buffer }[]> {
  return (await getStore()).listPrintModels(id);
}

export async function updatePrintName(id: string, displayName: string): Promise<void> {
  return (await getStore()).updatePrintName(id, displayName);
}

export async function deletePrint(id: string): Promise<void> {
  const store = await getStore();
  await store.deletePrint(id);
  await originalArchives.remove(id);
}

export async function getPrintCostInputs(id: string): Promise<PrintCostInputs | null> {
  return (await getStore()).getPrintCostInputs(id);
}

export async function savePrintCostInputs(id: string, inputs: PrintCostInputs): Promise<void> {
  return (await getStore()).savePrintCostInputs(id, inputs);
}

export async function listOrders(): Promise<PrintOrder[]> {
  return (await getStore()).listOrders();
}

export async function saveOrder(order: PrintOrder): Promise<PrintOrder> {
  const store = await getStore();
  const existing = (await store.listOrders()).find((item) => item.id === order.id);
  let saved: PrintOrder;
  if (!existing) {
    const history = order.history ?? [
      { type: "created" as const, at: order.createdAt },
      ...(order.status === "completed" ? [{ type: "completed" as const, at: order.createdAt }] : []),
    ];
    saved = { ...order, history };
  } else if (existing.updatedAt !== order.updatedAt) {
    const history = existing.history ?? [{ type: "created" as const, at: existing.createdAt }];
    saved = {
      ...order,
      history: [
        ...history,
        { type: "updated", at: order.updatedAt },
        ...(existing.status !== "completed" && order.status === "completed"
          ? [{ type: "completed" as const, at: order.updatedAt }]
          : []),
      ],
    };
  } else {
    saved = { ...order, history: order.history ?? existing.history };
  }
  await store.saveOrder(saved);
  return saved;
}

export async function saveOrderQueue(orders: PrintOrder[]): Promise<void> {
  const store = await getStore();
  const currentOrders = await store.listOrders();
  const byId = new Map(currentOrders.map((order) => [order.id, order]));
  const updatedAt = new Date().toISOString();
  const updatedOrders = orders.map((order) => {
    const current = byId.get(order.id);
    if (!current) throw new Error("Auftrag nicht gefunden.");
    const history = current.history ?? [{ type: "created" as const, at: current.createdAt }];
    return {
      ...current,
      queuePosition: order.queuePosition,
      updatedAt,
      history: [...history, { type: "updated" as const, at: updatedAt }],
    };
  });
  await store.saveOrderQueue(updatedOrders);
}

export async function listMaterialBookings(printId?: string): Promise<MaterialBooking[]> {
  return (await getStore()).listMaterialBookings(printId);
}

export async function createMaterialBooking(booking: MaterialBooking, activeKey: string | null): Promise<boolean> {
  return (await getStore()).createMaterialBooking(booking, activeKey);
}

export async function saveMaterialBooking(booking: MaterialBooking, activeKey: string | null): Promise<void> {
  return (await getStore()).saveMaterialBooking(booking, activeKey);
}

export async function listAccessoryStockMovements(): Promise<AccessoryStockMovement[]> {
  return (await getStore()).listAccessoryStockMovements();
}

export async function applyAccessoryStockMovements(
  movements: AccessoryStockMovement[],
): Promise<"applied" | "duplicate" | "insufficient" | "limit" | "not_found"> {
  return (await getStore()).applyAccessoryStockMovements(movements);
}

export async function deleteOrder(id: string): Promise<void> {
  return (await getStore()).deleteOrder(id);
}

export async function getApplicationDataSnapshot(): Promise<ApplicationDataSnapshot> {
  const store = await getStore();
  const [settings, prints, orders, materialBookings, accessoryStockMovements] = await Promise.all([
    store.getSettings(),
    store.listPrints(),
    store.listOrders(),
    store.listMaterialBookings(),
    store.listAccessoryStockMovements(),
  ]);
  return {
    settings,
    orders,
    materialBookings,
    accessoryStockMovements,
    prints: await Promise.all(prints.map(async (print) => ({
      print,
      costInputs: await store.getPrintCostInputs(print.id),
      models: await store.listPrintModels(print.id),
    }))),
  };
}

export async function replaceApplicationData(data: ApplicationDataSnapshot): Promise<void> {
  await (await getStore()).replaceApplicationData(data);
  softwareUpdates.configure(data.settings.general);
}

/** Copies all application data into a verified target store before it becomes active. */
export async function transferDatabaseData(targetConnection: ResolvedDbConnection): Promise<void> {
  const source = await getStore();
  const target = await createStoreForConnection(targetConnection);
  const [settings, prints] = await Promise.all([source.getSettings(), source.listPrints()]);

  for (const print of prints) {
    if (await target.getPrint(print.id)) {
      throw new Error(`Der Druck „${print.fileName}“ existiert bereits in der Zieldatenbank.`);
    }
  }

  await target.saveSettings(settings);
  for (const print of prints) {
    await target.insertPrint(print);
    for (const { plateIndex, model } of await source.listPrintModels(print.id)) {
      await target.savePrintModel(print.id, model, plateIndex ?? undefined);
    }
    const inputs = await source.getPrintCostInputs(print.id);
    if (inputs) await target.savePrintCostInputs(print.id, inputs);
  }
  for (const order of await source.listOrders()) {
    await target.saveOrder(order);
  }
  for (const booking of await source.listMaterialBookings()) {
    await target.createMaterialBooking(booking, materialBookingActiveKey(booking));
  }
  const accessoryMovements = await source.listAccessoryStockMovements();
  if (accessoryMovements.length) {
    await target.importAccessoryStockMovements(accessoryMovements);
  }
}
