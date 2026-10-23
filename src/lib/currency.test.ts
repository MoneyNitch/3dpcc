import assert from "node:assert/strict";
import { test } from "node:test";
import { CURRENCY_CODES, getCurrencyOptions, getCurrencySymbol, isCurrencyCode } from "./currency";

test("provides localized names for the supported world currencies", () => {
  const german = getCurrencyOptions("de");
  const english = getCurrencyOptions("en");

  assert.equal(german.length, CURRENCY_CODES.length);
  assert.equal(english.length, CURRENCY_CODES.length);
  assert.ok(german.length > 150);
  assert.ok(german.some(({ code }) => code === "XCG"));
  assert.ok(german.every(({ name }) => name.length > 0));
  assert.notEqual(german.find(({ code }) => code === "JPY")?.name, english.find(({ code }) => code === "JPY")?.name);
});

test("validates currency codes and derives locale-aware symbols", () => {
  assert.equal(isCurrencyCode("EUR"), true);
  assert.equal(isCurrencyCode("XXX"), false);
  assert.equal(isCurrencyCode("euro"), false);
  assert.equal(getCurrencySymbol("EUR", "de"), "€");
  assert.equal(getCurrencySymbol("USD", "en"), "$");
  assert.ok(getCurrencySymbol("JPY", "en").length > 0);
});
