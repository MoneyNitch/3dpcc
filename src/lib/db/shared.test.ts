import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultSettings, migrateSettings } from "./shared";

test("enables 3D previews by default", () => {
  assert.equal(defaultSettings.general.enable3dPreview, true);
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
