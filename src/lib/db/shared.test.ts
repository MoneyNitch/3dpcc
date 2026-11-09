import assert from "node:assert/strict";
import { test } from "node:test";
import { assignAccessoryNumbers, defaultSettings, migrateSettings, preserveAccessoryStock, recordOrderDeliveryDate } from "./shared";

test("enables 3D previews by default", () => {
  assert.equal(defaultSettings.general.enable3dPreview, true);
});

test("records actual delivery once when an order is marked delivered", () => {
  const order = {
    id: "12345678-1234-4234-8234-123456789abc",
    customerName: "Customer",
    status: "ready" as const,
    shippingStatus: "delivered" as const,
    dueDate: null,
    notes: "",
    items: [],
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-05T12:00:00.000Z",
  };
  const delivered = recordOrderDeliveryDate(order);
  assert.equal(delivered.deliveredAt, order.createdAt);
  assert.equal(recordOrderDeliveryDate({ ...order, updatedAt: "2026-01-06T12:00:00.000Z" }, delivered).deliveredAt,
    order.createdAt);
  const transition = recordOrderDeliveryDate(order, { ...order, shippingStatus: "shipped", deliveredAt: null });
  assert.equal(transition.deliveredAt, order.updatedAt);
  assert.equal(recordOrderDeliveryDate({ ...order, shippingStatus: "shipped" }, transition).deliveredAt,
    order.updatedAt);
  assert.equal(recordOrderDeliveryDate({ ...order, shippingStatus: "shipped" }).deliveredAt, null);
});

test("migrates and preserves the product catalog through ordinary settings saves", () => {
  const legacy = migrateSettings({ ...defaultSettings, productTypes: undefined });
  assert.deepEqual(legacy.productTypes, []);
  const migratedProduct = migrateSettings({
    ...defaultSettings,
    productTypes: [{
      id: "12345678-1234-4234-8234-123456789abc",
      name: "Legacy lamp",
      prefix: "LAMP-",
      digits: 5,
      nextNumber: 8,
      fileName: "lamp.3mf",
    }],
  }).productTypes[0];
  assert.deepEqual(migratedProduct.serialNumbers, []);
  assert.equal(migratedProduct.linkedPrintId, null);
  assert.equal(migratedProduct.imageMode, "print");
  assert.equal(migratedProduct.imageBase64, null);
  const product = {
    id: "12345678-1234-4234-8234-123456789abc",
    name: "Lamp",
    prefix: "LAMP-",
    digits: 5,
    nextNumber: 8,
    fileName: "lamp.3mf",
    linkedPrintId: null,
    imageMode: "print" as const,
    imageBase64: null,
    serialNumbers: [],
  };
  const current = { ...defaultSettings, productTypes: [product] };
  assert.deepEqual(preserveAccessoryStock(defaultSettings, current).productTypes, [{
    ...product, linkedPrintId: null, imageMode: "print", imageBase64: null,
  }]);
});

test("legacy accessory numbers are sequential, stable and never reused after deletion", () => {
  const item = { name: "Clips", pricePerPack: 1, unitsPerPack: 1, stockQuantity: 0 };
  const legacy = migrateSettings({ ...defaultSettings, nextAccessoryNumber: undefined,
    accessoryMaterials: [{ ...item, id: "a" }, { ...item, id: "b" }] });
  assert.deepEqual(legacy.accessoryMaterials.map((entry) => entry.numericId), [1, 2]);
  assert.equal(legacy.nextAccessoryNumber, 3);
  assert.deepEqual(migrateSettings(JSON.parse(JSON.stringify(legacy))), legacy);
  const deleted = { ...legacy, accessoryMaterials: [] };
  const created = assignAccessoryNumbers({ ...deleted, accessoryMaterials: [{ ...item, id: "c" }] });
  assert.equal(created.accessoryMaterials[0].numericId, 3);
  const stale = preserveAccessoryStock({ ...defaultSettings, accessoryMaterials: [{ ...item, id: "c", numericId: 1 }] }, created);
  assert.equal(stale.accessoryMaterials[0].numericId, 3);
  assert.equal(stale.nextAccessoryNumber, 4);
  assert.throws(() => assignAccessoryNumbers({ ...legacy, accessoryMaterials: [
    { ...item, id: "x", numericId: 1 }, { ...item, id: "y", numericId: 1 },
  ] }), /duplicate/);
});

test("GitHub functions default to enabled but disabled choices persist through migration", () => {
  const legacy = migrateSettings({ ...defaultSettings, general: { language: "de", currency: "EUR" } });
  assert.equal(legacy.general.fetchGithubChangelog, true);
  assert.equal(legacy.general.checkGithubUpdates, true);
  const disabled = migrateSettings(JSON.parse(JSON.stringify({
    ...defaultSettings,
    general: { ...defaultSettings.general, fetchGithubChangelog: false, checkGithubUpdates: false },
  })));
  assert.equal(disabled.general.fetchGithubChangelog, false);
  assert.equal(disabled.general.checkGithubUpdates, false);
});

test("migrates older settings without changing language or currency", () => {
  const settings = migrateSettings({
    ...defaultSettings,
    general: { language: "en", currency: "USD" },
  });
  assert.deepEqual(settings.general, {
    ...defaultSettings.general,
    language: "en",
    currency: "USD",
  });
});

test("migrates invoice sender details and preserves configured values", () => {
  const settings = migrateSettings({
    ...defaultSettings,
    general: { ...defaultSettings.general, companyName: "Example Studio" },
  });
  assert.equal(settings.general.companyName, "Example Studio");
  assert.equal(settings.general.companyAddress, "");
});

test("preserves disabled 3D previews across saving and migration", () => {
  const saved = JSON.stringify({
    ...defaultSettings,
    general: { ...defaultSettings.general, enable3dPreview: false },
  });
  assert.equal(migrateSettings(JSON.parse(saved)).general.enable3dPreview, false);
});

test("preserves the configured background calculation duty cycle", () => {
  const settings = migrateSettings({
    ...defaultSettings,
    general: { ...defaultSettings.general, previewComputePercent: 10 },
  });
  assert.equal(settings.general.previewComputePercent, 10);
});

test("migrates settings predating the general section", () => {
  const settings = migrateSettings({ ...defaultSettings, general: undefined });
  assert.deepEqual(settings.general, defaultSettings.general);
});

test("preserves supported currencies and repairs invalid currency settings", () => {
  const supported = migrateSettings({
    ...defaultSettings,
    general: { ...defaultSettings.general, currency: "XCG" },
  });
  assert.equal(supported.general.currency, "XCG");

  const invalid = migrateSettings({
    ...defaultSettings,
    general: { ...defaultSettings.general, currency: "NOT_A_CURRENCY" },
  });
  assert.equal(invalid.general.currency, defaultSettings.general.currency);
});

test("migrates settings without custom language packs", () => {
  const settings = migrateSettings({ ...defaultSettings, customLanguagePacks: undefined });
  assert.deepEqual(settings.customLanguagePacks, []);
});

test("migrates legacy accessories with zero stock and preserves inventory outside settings edits", () => {
  const legacy = migrateSettings({
    ...defaultSettings,
    accessoryMaterials: [{ id: "clips", name: "Clips", pricePerPack: 4, unitsPerPack: 20 }],
  });
  assert.equal(legacy.accessoryMaterials[0].stockQuantity, 0);

  const current = {
    ...legacy,
    accessoryMaterials: [{ ...legacy.accessoryMaterials[0], stockQuantity: 12 }],
  };
  const edited = {
    ...current,
    accessoryMaterials: [
      { ...current.accessoryMaterials[0], name: "Binder clips", stockQuantity: 999 },
      { id: "new", name: "New item", pricePerPack: 1, unitsPerPack: 1, stockQuantity: 999 },
    ],
  };
  const saved = preserveAccessoryStock(edited, current);
  assert.deepEqual(saved.accessoryMaterials.map((item) => item.stockQuantity), [12, 0]);
});
