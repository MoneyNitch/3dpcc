import assert from "node:assert/strict";
import { test } from "node:test";
import { builtInRoles } from "./auth/permissions";
import {
  createLanguagePackTemplate,
  parseLanguagePack,
  parseLocalizedNumber,
  translate,
} from "./i18n";

test("built-in role permission details are translated including superadmin user management", () => {
  for (const language of ["de", "en"]) {
    const keys = [
      "auth.viewPermissions", "auth.builtInPermissionsNote", "auth.noPermissions",
      ...builtInRoles.flatMap((role) => role.permissions.map((permission) => `auth.permission.${permission}`)),
    ];
    for (const key of keys) assert.notEqual(translate(language, key), key);
  }
});

test("manual print layout labels are translated in both languages", () => {
  for (const language of ["de", "en"]) {
    for (const key of [
      "manual.title", "manual.subtitle", "manual.hideForm", "manual.basicDetails",
      "manual.namePlaceholder", "manual.createHint",
    ]) assert.notEqual(translate(language, key), key);
  }
});

test("software privacy, switches and update states are translated", () => {
  for (const language of ["de", "en"]) {
    for (const key of [
      "software.title", "software.privacy", "software.offline", "software.fetchGithubChangelog",
      "software.checkGithubUpdates", "software.savedImmediately", "software.changelogFallback",
      ...["disabled", "available", "current", "no-release", "error"].map((status) => `software.update.${status}`),
      ...["local", "connection", "cancelled", "response", "rate-limit", "limit", "version"].map((code) => `software.githubError.${code}`),
    ]) assert.notEqual(translate(language, key), key);
  }
});

test("parses custom language packs and falls back to English", () => {
  const pack = parseLanguagePack({
    code: "fr-fr",
    name: "Français",
    translations: { "nav.prints": "Impressions" },
  });

  assert.equal(pack.code, "fr-FR");
  assert.equal(translate(pack.code, "nav.prints", undefined, [pack]), "Impressions");
  assert.equal(translate(pack.code, "nav.settings", undefined, [pack]), "Settings");
});

test("rejects built-in language codes and invalid translations", () => {
  assert.throws(() => parseLanguagePack({
    code: "en",
    name: "English",
    translations: { "nav.prints": "Prints" },
  }));
  assert.throws(() => parseLanguagePack({
    code: "fr",
    name: "Français",
    translations: { "nav.prints": 123 },
  }));
});

test("formats localized numbers and provides a complete English template", () => {
  assert.equal(parseLocalizedNumber("1 234,5", "fr"), 1234.5);
  assert.equal(parseLocalizedNumber("1,234.5", "en"), 1234.5);
  const template = createLanguagePackTemplate();
  assert.ok(Object.keys(template).length > 0);
  assert.equal(template["nav.prints"], "Prints");
  assert.ok(Object.values(template).every((value) => typeof value === "string"));
});

test("upload confirmation labels are translated in both built-in languages", () => {
  assert.equal(translate("de", "upload.submit"), "Datei hochladen");
  assert.equal(translate("en", "upload.submit"), "Upload file");
  for (const language of ["de", "en"]) {
    for (const key of ["upload.customName", "upload.customNamePlaceholder"]) {
      assert.notEqual(translate(language, key), key);
    }
  }
  assert.equal(createLanguagePackTemplate()["upload.submit"], "Upload file");
});

test("statistics labels are translated in both built-in languages", () => {
  for (const language of ["de", "en"]) {
    for (const key of [
      "nav.statistics",
      "stats.title",
      "stats.income",
      "stats.printTime",
      "stats.material",
      "stats.materialBreakdown",
      "stats.note",
    ]) {
      assert.notEqual(translate(language, key), key);
    }
  }
});

test("additional cost quantity is translated in both built-in languages", () => {
  assert.equal(translate("de", "extra.quantity"), "Menge");
  assert.equal(translate("en", "extra.quantity"), "Quantity");
});

test("accessory stock management labels are translated in both built-in languages", () => {
  for (const language of ["de", "en"]) {
    for (const key of [
      "settings.stock",
      "settings.stockReceive",
      "settings.stockAdjust",
      "settings.stockHistory",
      "accessory.stockBook",
      "accessory.stockConfirm",
      "accessory.stockBooked",
    ]) {
      assert.notEqual(translate(language, key), key);
    }
  }
});

test("bulk inventory actions and partial outcomes are translated", () => {
  for (const language of ["de", "en"]) {
    for (const key of [
      "inventory.update", "inventory.confirm", "inventory.hint", "inventory.empty",
      "inventory.failed", "inventory.booked", "inventory.skipped", "inventory.uncertain", "inventory.rejected",
    ]) {
      assert.notEqual(translate(language, key), key);
    }
  }
});
