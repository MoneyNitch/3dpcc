import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createLanguagePackTemplate,
  parseLanguagePack,
  parseLocalizedNumber,
  translate,
} from "./i18n";

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
