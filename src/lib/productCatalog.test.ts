import assert from "node:assert/strict";
import { test } from "node:test";
import { createProductSerialBatch, ProductCatalogError } from "./productCatalog";
import { defaultSettings } from "./db/shared";
import { settingsSchema } from "./api/schemas";

const product = {
  id: "12345678-1234-4234-8234-123456789abc",
  name: "Lamp",
  prefix: "LAMP-",
  digits: 4,
  nextNumber: 8,
  fileName: "lamp.3mf",
  linkedPrintId: null,
  imageMode: "none" as const,
  imageBase64: null,
  serialNumbers: [],
};

test("generates zero-padded consecutive serials and advances the next number", () => {
  assert.deepEqual(createProductSerialBatch(product, 3), {
    serials: ["LAMP-0008", "LAMP-0009", "LAMP-0010"],
    nextNumber: 11,
  });
});

test("rejects invalid quantities and exhausted number ranges", () => {
  for (const quantity of [0, -1, 1.5, 1001]) {
    assert.throws(() => createProductSerialBatch(product, quantity),
      (error: unknown) => error instanceof ProductCatalogError && error.status === 400);
  }
  assert.throws(() => createProductSerialBatch({ ...product, nextNumber: 1_000_000_001 }, 1),
    (error: unknown) => error instanceof ProductCatalogError && error.status === 409);
  assert.throws(() => createProductSerialBatch({
    ...product,
    serialNumbers: Array.from({ length: 10_000 }, (_, index) => ({
      serialNumber: `LAMP-${index}`,
      orderId: null,
    })),
  }, 1), (error: unknown) => error instanceof ProductCatalogError && error.status === 409);
});

test("settings validate product types and reject duplicate prefixes", () => {
  assert.equal(settingsSchema.safeParse({ ...defaultSettings, productTypes: [product] }).success, true);
  assert.equal(settingsSchema.safeParse({ ...defaultSettings, productTypes: [
    product, { ...product, id: "12345678-1234-4234-8234-123456789abd", prefix: "lamp-" },
  ] }).success, false);
});

test("settings validate optional product image and linked-print fields", () => {
  assert.equal(settingsSchema.safeParse({ ...defaultSettings, productTypes: [
    { ...product, fileName: "" },
  ] }).success, true);
  assert.equal(settingsSchema.safeParse({ ...defaultSettings, productTypes: [
    { ...product, imageMode: "custom", imageBase64: "data:image/png;base64,aGVsbG8=" },
  ] }).success, true);
  assert.equal(settingsSchema.safeParse({ ...defaultSettings, productTypes: [
    { ...product, imageMode: "custom", imageBase64: null },
  ] }).success, false);
  assert.equal(settingsSchema.safeParse({ ...defaultSettings, productTypes: [
    { ...product, linkedPrintId: "not-an-id" },
  ] }).success, false);
  assert.equal(settingsSchema.safeParse({ ...defaultSettings, productTypes: [
    { ...product, serialNumbers: [
      { serialNumber: "LAMP-0001", orderId: null },
      { serialNumber: "LAMP-0001", orderId: null },
    ] },
  ] }).success, false);
});
