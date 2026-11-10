import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { defaultSettings } from "../db/shared";
import { calculateAllPlatesCost, defaultCostInputs } from "../costCalculator";
import type { ParsedPrint, PrintCostInputs, PrintOrder } from "../types";
import { bearerKey, configuredKeys, createDocsSession, docsCookie, validDocsSession } from "./auth";
import { handleDocs } from "./docs";
import { ApiError, errorResponse, readBody } from "./http";
import { createOperations, type ApiDependencies } from "./operations";
import { createOpenApi } from "./openapi";
import { dispatchApi } from "./router";
import { runInNewContext } from "node:vm";

const key = "a".repeat(43);
const secondKey = "b".repeat(43);
test("API documentation HTTPS notices use browser protocol, including behind a proxy", async () => {
  const f = fixture();
  for (const authorization of [null, `Bearer ${key}`]) {
    const response = await f.send("/docs", "GET", undefined, authorization);
    const text = await response.text();
    assert.match(text, /id="http-warning" role="note" hidden/);
    assert.match(text, /HTTPS is recommended/);
    const script = text.match(/<script nonce="[^"]+">(document\.getElementById\("http-warning"\)[\s\S]*?)<\/script>/)?.[1];
    assert.ok(script);
    for (const protocol of ["http:", "https:"]) {
      const notice = { hidden: true };
      runInNewContext(script, { document: { getElementById: () => notice }, location: { protocol } });
      assert.equal(notice.hidden, protocol === "https:");
    }
  }
});
test("reverse-proxy secure cookie configuration also covers legacy documentation sessions", () => {
  const previous = process.env.AUTH_COOKIE_SECURE;
  try {
    process.env.AUTH_COOKIE_SECURE = "true";
    assert.match(docsCookie(new Request("http://localhost/api/v1/docs"), "session"), /; Secure$/);
  } finally {
    if (previous === undefined) delete process.env.AUTH_COOKIE_SECURE;
    else process.env.AUTH_COOKIE_SECURE = previous;
  }
});
let previousKeys: string | undefined;
let previousAuth: string | undefined;
beforeEach(() => {
  previousAuth = process.env.AUTH_ENABLED;
  process.env.AUTH_ENABLED = "false";
  previousKeys = process.env.API_KEYS;
  process.env.API_KEYS = `${key}, ${secondKey}`;
});
afterEach(() => {
  if (previousAuth === undefined) delete process.env.AUTH_ENABLED;
  else process.env.AUTH_ENABLED = previousAuth;
  if (previousKeys === undefined) delete process.env.API_KEYS;
  else process.env.API_KEYS = previousKeys;
});

function fixture() {
  let settings = structuredClone(defaultSettings);
  const prints = new Map<string, ParsedPrint>();
  const orders = new Map<string, PrintOrder>();
  const savedInputs = new Map<string, PrintCostInputs>();
  const calls: string[] = [];
  const dependencies: ApiDependencies = {
    store: {
      async getSettings() { calls.push("getSettings"); return structuredClone(settings); },
      async saveSettings(value) { settings = structuredClone(value); },
      async listPrints() { calls.push("listPrints"); return [...prints.values()]; },
      async listOrders() { return [...orders.values()]; },
      async getPrint(id) { calls.push("getPrint"); return prints.get(id) ?? null; },
      async insertPrint(print) { prints.set(print.id, structuredClone(print)); },
      async savePrint(print) { prints.set(print.id, structuredClone(print)); },
      async updatePrintName(id, displayName) {
        const print = prints.get(id);
        assert.ok(print);
        prints.set(id, { ...print, displayName });
      },
      async deletePrint(id) { prints.delete(id); savedInputs.delete(id); },
      async getPrintCostInputs(id) { return savedInputs.get(id) ?? null; },
      async savePrintCostInputs(id, inputs) { savedInputs.set(id, structuredClone(inputs)); },
    },
    async upload() { calls.push("upload"); return Response.json({ print: { id: crypto.randomUUID() } }, { status: 201 }); },
    async splitPlates() { calls.push("split"); return Response.json({ count: 1 }, { status: 201 }); },
    async model() { calls.push("model"); return Response.json({ status: "queued" }, { status: 202, headers: { "Retry-After": "3" } }); },
    async retryModel() { calls.push("retry"); return Response.json({ status: "queued" }, { status: 202 }); },
    async cancelPreview() { calls.push("cancel"); },
    async settingsChanged() { calls.push("settingsChanged"); },
  };
  const operations = createOperations(dependencies);
  async function send(path: string, method = "GET", body?: unknown, authorization: string | null = `Bearer ${key}`) {
    const headers: Record<string, string> = {};
    if (authorization) headers.Authorization = authorization;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const request = new Request(`http://localhost/api/v1${path}`, {
      method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const parts = new URL(request.url).pathname.slice("/api/v1/".length).split("/").map(decodeURIComponent);
    return dispatchApi(request, parts, operations, handleDocs);
  }
  return { send, operations, dependencies, calls, prints, orders, savedInputs };
}
const manual = { name: "Test", minutes: 60,
  filaments: [{ filamentId: "1", type: "PLA", color: "#CCCCCC", usedGramsTotal: 100 }] };

test("keys are explicit, URL-safe, rotatable, and never accepted from URLs", () => {
  assert.deepEqual(configuredKeys(` ${key},${secondKey},${key} `), [key, secondKey]);
  assert.deepEqual(configuredKeys(""), []);
  for (const value of ["short", `${key},`, `${key}, `, "a".repeat(257), `${key} space`]) {
    assert.throws(() => configuredKeys(value));
  }
  assert.equal(bearerKey(new Request("http://localhost?api_key=" + key), [key]), undefined);
  assert.equal(bearerKey(new Request("http://localhost", { headers: { Authorization: `Bearer ${secondKey}` } }), [key, secondKey]), secondKey);
  assert.equal(bearerKey(new Request("http://localhost", { headers: { Authorization: `Bearer ${key}` } }), [secondKey]), undefined);
});

test("docs sessions expire, reject tampering and are revoked when their key is removed", () => {
  const now = Date.now();
  const session = createDocsSession(key, now);
  const request = new Request("https://localhost/api/v1/docs", { headers: { Cookie: `pcc-api-docs=${session}` } });
  assert.equal(validDocsSession(request, [key], now), true);
  assert.equal(validDocsSession(request, [secondKey], now), false);
  assert.equal(validDocsSession(request, [key], now + 3600_000), false);
  assert.equal(validDocsSession(new Request(request.url, { headers: { Cookie: `pcc-api-docs=${session.slice(0, -1)}x` } }), [key], now), false);
  const cookie = docsCookie(request, session);
  for (const flag of ["HttpOnly", "SameSite=Strict", "Secure", "Path=/api/v1/docs", "Max-Age=3600"]) assert.ok(cookie.includes(flag));
  assert.ok(!docsCookie(new Request("http://localhost"), session).includes("Secure"));
  assert.ok(!session.includes(key));
});

test("disabled API, unauthorized calls and unknown methods never touch storage", async () => {
  const f = fixture();
  delete process.env.API_KEYS;
  assert.equal((await f.send("/prints")).status, 503);
  process.env.API_KEYS = key;
  for (const [path, method] of [["/prints", "GET"], ["/not-found", "DELETE"], ["/prints/upload", "PATCH"], ["/prints/00000000-0000-0000-0000-000000000000/download", "GET"], ["/docs/openapi.json", "GET"]]) {
    const response = await f.send(path, method, undefined, null);
    assert.equal(response.status, 401);
    assert.ok(response.headers.get("www-authenticate"));
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(f.calls.length, 0);
  assert.equal((await f.send("/not-found")).status, 404);
  const response = await f.send("/prints/upload", "PATCH");
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.equal((await f.send("/prints", "HEAD")).body, null);
});

test("manual print CRUD persists inputs, calculations are read-only, deletion cancels previews", async () => {
  const f = fixture();
  const created = await f.send("/prints", "POST", manual);
  assert.equal(created.status, 201);
  const { print } = await created.json();
  assert.equal(created.headers.get("location"), `/api/v1/prints/${print.id}`);
  assert.equal(print.plate.totalWeightGrams, 100);
  assert.equal((await f.send(`/prints/${print.id}`, "PATCH", { displayName: "Renamed" })).status, 200);
  const inputs = await f.send(`/prints/${print.id}/cost-inputs`, "PUT", { quantity: 2, laborMinutes: 15 });
  assert.equal(inputs.status, 200);
  assert.equal((await inputs.json()).costInputs.quantity, 2);
  const calculation = await f.send(`/prints/${print.id}/calculate`, "POST", { inputs: { quantity: 3 }, plateIndex: "all" });
  assert.equal(calculation.status, 200);
  const calculated = await calculation.json();
  assert.equal(calculated.result.materialTotal, 6);
  assert.equal(calculated.currency, "EUR");
  assert.equal(f.savedInputs.get(print.id)?.quantity, 2);
  const detail = await (await f.send(`/prints/${print.id}`)).json();
  assert.equal(detail.print.displayName, "Renamed");
  assert.equal(detail.print.plate.objects[0].name, "Renamed");
  assert.equal(detail.costInputs.quantity, 2);
  assert.equal((await f.send(`/prints/${print.id}/manual`, "PUT", { ...manual, minutes: 120 })).status, 200);
  assert.equal(f.prints.get(print.id)?.plate.totalPrintTimeSeconds, 7200);
  assert.equal((await f.send(`/prints/${print.id}`, "DELETE")).status, 200);
  assert.ok(f.calls.includes("cancel"));
  assert.equal((await f.send(`/prints/${print.id}`)).status, 404);
  assert.equal((await f.send(`/prints/${print.id}/cost-inputs`, "PUT", { quantity: 1 })).status, 404);
  assert.equal((await f.send(`/prints/${print.id}`, "DELETE")).status, 404);
});

test("prints linked to an order cannot be deleted through the versioned API", async () => {
  const f = fixture();
  const { print } = await (await f.send("/prints", "POST", manual)).json();
  f.orders.set("order-id", {
    id: "order-id",
    customerName: "Customer",
    status: "open",
    dueDate: null,
    notes: "",
    items: [{ printId: print.id, quantity: 1 }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const response = await f.send(`/prints/${print.id}`, "DELETE");
  assert.equal(response.status, 409);
  assert.equal(f.prints.has(print.id), true);
  assert.equal(f.calls.includes("cancel"), false);
});

test("invalid data is rejected before side effects; missing/defaulted input behavior stays compatible", async () => {
  const f = fixture();
  for (const body of [null, {}, { ...manual, extra: true }, { ...manual, minutes: -1 },
    { ...manual, filaments: [...manual.filaments, ...manual.filaments] },
    { ...manual, categoryByFilament: [{ filamentId: "1", categories: [{ category: "model", grams: 99 }] }] }]) {
    assert.equal((await f.send("/prints", "POST", body)).status, 400);
  }
  assert.equal(f.prints.size, 0);
  const { print } = await (await f.send("/prints", "POST", manual)).json();
  for (const body of [{ quantity: 0 }, { quantity: 1.5 }, { vatPercent: 101 }, { bogus: 1 },
    { externalSpools: { "1": { provider: "invalid" } } }, { printerId: "missing" }]) {
    const response = await f.send(`/prints/${print.id}/cost-inputs`, "PUT", body);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "validation_error");
  }
  assert.equal((await f.send("/prints/not-a-uuid")).status, 400);
  assert.equal((await f.send("/prints?limit=101")).status, 400);
  assert.equal((await f.send("/prints?offset=-1")).status, 400);
  assert.equal((await f.send("/prints?api_key=anything")).status, 400);
  assert.equal((await f.send("/prints?limit=1&offset=0")).status, 200);
  const legacy = defaultCostInputs(defaultSettings);
  const older = Object.fromEntries(Object.entries(legacy).filter(([field]) => !["externalSpools", "quantityDiscountThreshold", "quantityDiscountPercent"].includes(field)));
  // Exercise the JSON compatibility path, as persisted records are untyped at runtime.
  f.dependencies.store.getPrintCostInputs = async () => JSON.parse(JSON.stringify(older));
  const read = await (await f.send(`/prints/${print.id}`)).json();
  assert.deepEqual(read.costInputs.externalSpools, {});
  assert.equal(read.costInputs.quantityDiscountThreshold, 5);
});

test("multi-plate calculation matches the shared calculator and handles old plate indices", async () => {
  const f = fixture();
  const { print } = await (await f.send("/prints", "POST", manual)).json();
  const saved = f.prints.get(print.id)!;
  const first = { ...saved.plate, plateIndex: 1 };
  const second = { ...saved.plate, plateIndex: 2, totalWeightGrams: 200,
    totalPrintTimeSeconds: 7200, filaments: saved.plate.filaments.map((item) => ({ ...item, usedGramsTotal: 200 })) };
  f.prints.set(print.id, { ...saved, plate: first, plates: [first, second] });
  assert.equal((await f.send(`/prints/${print.id}/plates`, "PATCH", { plateIndex: 2, plateName: "Drawer" })).status, 200);
  assert.equal(f.prints.get(print.id)?.plates?.[1].plateName, "Drawer");
  const document = await f.send("/invoices", "POST", { printId: print.id,
    templateId: "default-invoice-template", documentNumber: "PLATE-1", date: "2026-10-31", plateIndex: "all" });
  assert.equal(document.status, 200);
  assert.ok((await document.text()).includes("Drawer"));
  const result = await (await f.send(`/prints/${print.id}/calculate`, "POST", { plateIndex: "all" })).json();
  assert.deepEqual(result.result, calculateAllPlatesCost([first, second], defaultSettings, defaultCostInputs(defaultSettings)));
  assert.equal((await f.send(`/prints/${print.id}/calculate`, "POST", { plateIndex: 3 })).status, 404);
  f.prints.set(print.id, saved);
  assert.equal((await f.send(`/prints/${print.id}/calculate`, "POST", { plateIndex: 1 })).status, 200);
  const model = await f.send(`/prints/${print.id}/model?plateIndex=1`);
  assert.equal(model.status, 202);
  assert.equal(model.headers.get("retry-after"), "3");
  assert.equal((await f.send(`/prints/${print.id}/model?plateIndex=nope`)).status, 400);
});

test("all settings collections support CRUD and cannot invalidate the default printer", async () => {
  const f = fixture();
  const cases = [
    ["/materials", { id: "new", name: "PLA", type: "PLA", color: "#000000", pricePerKg: 12 }],
    ["/accessory-materials", { id: "new", name: "Screws", pricePerPack: 4, unitsPerPack: 20 }],
    ["/printers", { ...defaultSettings.printers[0], id: "new" }],
    ["/invoices/templates", { ...defaultSettings.invoiceTemplates[0], id: "new" }],
    ["/quotes/templates", { ...defaultSettings.quoteTemplates[0], id: "new" }],
  ] as const;
  for (const [path, item] of cases) {
    assert.equal((await f.send(path, "POST", item)).status, 201);
    assert.equal((await f.send(path, "POST", item)).status, 409);
    assert.equal((await f.send(`${path}/new`)).status, 200);
    assert.equal((await f.send(`${path}/new`, "PUT", { ...item, name: "Updated" })).status, 200);
    const read = await (await f.send(`${path}/new`)).json();
    assert.equal(read.item.name, "Updated");
    assert.equal((await f.send(`${path}/new`, "PUT", { ...item, id: "wrong" })).status, 400);
    assert.equal((await f.send(`${path}/new`, "DELETE")).status, 200);
    assert.equal((await f.send(`${path}/new`)).status, 404);
  }
  assert.equal((await f.send("/printers/default-printer", "DELETE")).status, 409);
  const before = await f.dependencies.store.getSettings();
  const response = await f.send("/settings", "PATCH", { general: { currency: "USD" }, numbering: { invoice: { prefix: "INV" } } });
  assert.equal(response.status, 200);
  const updated = (await response.json()).settings;
  assert.equal(updated.general.currency, "USD");
  assert.equal(updated.general.language, before.general.language);
  assert.equal(updated.numbering.invoice.prefix, "INV");
  assert.deepEqual(updated.numbering.quote, before.numbering.quote);
  const featureUpdate = await f.send("/settings", "PATCH", { features: { customers: false } });
  assert.equal(featureUpdate.status, 200);
  assert.equal((await featureUpdate.json()).settings.features.customers, false);
  assert.equal((await f.dependencies.store.getSettings()).features.orders, true);
  assert.equal((await f.send("/settings", "PATCH", {})).status, 400);
  assert.equal((await f.send("/settings", "PATCH", { defaultPrinterId: "missing" })).status, 400);
  assert.equal((await f.send("/settings", "PATCH", { general: { language: "missing" } })).status, 400);
  assert.equal((await f.send("/settings", "PATCH", { general: { retainOriginalArchives: "true" } })).status, 400);
  assert.equal((await f.send("/settings", "PATCH", { general: { retainOriginalArchives: true } })).status, 200);
  assert.equal((await f.send("/settings", "PUT", updated)).status, 200);
  assert.ok(f.calls.includes("settingsChanged"));
  await Promise.all([
    f.send("/settings", "PATCH", { general: { companyName: "Company" } }),
    f.send("/settings", "PATCH", { costs: { laborRatePerHour: 30 } }),
  ]);
  const concurrent = await f.dependencies.store.getSettings();
  assert.equal(concurrent.general.companyName, "Company");
  assert.equal(concurrent.costs.laborRatePerHour, 30);
});

test("invoice and quote generation reuses templates and leaves numbering and inputs untouched", async () => {
  const f = fixture();
  assert.equal((await f.send("/settings", "PATCH", { general: { language: "en" } })).status, 200);
  const { print } = await (await f.send("/prints", "POST", manual)).json();
  for (const kind of ["invoices", "quotes"]) {
    const body = { printId: print.id, templateId: kind === "invoices" ? "default-invoice-template" : "default-quote-template",
      documentNumber: "CUSTOM-1", date: "2026-10-31", customerName: "<script>alert(1)</script>",
      customerAddress: "Example", inputs: { quantity: 2 } };
    const response = await f.send(`/${kind}`, "POST", body);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-type")?.includes("text/html"));
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="CUSTOM-1.html"');
    const html = await response.text();
    assert.ok(html.includes("CUSTOM-1"));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    assert.ok(!html.includes(key));
    assert.ok(html.includes("Tax (19 %)"));
    assert.ok(!html.includes("MwSt."));
    assert.ok(html.includes("Subtotal"));
    assert.equal((await f.send(`/${kind}`, "POST", { ...body, date: "2026-02-30" })).status, 400);
    assert.equal((await f.send(`/${kind}`, "POST", { ...body, templateId: "missing" })).status, 404);
  }
  assert.deepEqual((await f.dependencies.store.getSettings()).numbering, defaultSettings.numbering);
  assert.equal(f.savedInputs.size, 0);
});

test("OpenAPI documents every implemented operation with auth, request schemas, parameters and responses", () => {
  const f = fixture();
  const spec = createOpenApi(f.operations);
  assert.equal(spec.openapi, "3.1.0");
  assert.deepEqual(spec.security, [{ ApiKey: [] }]);
  assert.equal(Object.values(spec.paths).reduce((count, methods) => count + Object.keys(methods).length, 0), f.operations.length);
  assert.equal(new Set(f.operations.map((op) => op.operationId)).size, f.operations.length);
  const encoded = JSON.stringify(spec);
  assert.ok(!encoded.includes(key));
  assert.ok(encoded.includes('"format":"binary"'));
  assert.ok(encoded.includes('"name":"id","in":"path","required":true'));
  assert.ok(encoded.includes('"name":"limit","in":"query","required":false'));
  assert.ok(encoded.includes('"text/html"'));
  assert.ok(encoded.includes('"additionalProperties":false'));
  assert.ok(spec.paths["/prints/{id}/download"]);
  assert.ok(encoded.includes('"application/octet-stream"'));
});

test("docs and local Swagger assets require auth, documentation cookies cannot authorize API calls", async () => {
  const f = fixture();
  const login = await f.send("/docs", "GET", undefined, null);
  assert.equal(login.status, 401);
  assert.ok(!(await login.text()).includes("SwaggerUIBundle"));
  assert.equal((await f.send("/docs/swagger-ui-bundle.js", "GET", undefined, null)).status, 401);
  const signedIn = await f.send("/docs", "POST");
  const cookie = signedIn.headers.get("set-cookie")!.split(";")[0];
  assert.ok(!cookie.includes(key));
  const request = new Request("http://localhost/api/v1/docs", { headers: { Cookie: cookie } });
  const view = await dispatchApi(request, ["docs"], f.operations, handleDocs);
  assert.equal(view.status, 200);
  const text = await view.text();
  assert.ok(text.includes("SwaggerUIBundle"));
  assert.ok(text.includes("validatorUrl: null"));
  assert.ok(text.includes("persistAuthorization: false"));
  assert.ok(text.includes('filter: true'));
  assert.ok(text.includes('class="docs-shell"'));
  assert.ok(text.includes('class="docs-header"'));
  assert.ok(!text.includes("main{max-width:500px"));
  assert.ok(!text.includes(key));
  const data = new Request("http://localhost/api/v1/prints", { headers: { Cookie: cookie } });
  assert.equal((await dispatchApi(data, ["prints"], f.operations, handleDocs)).status, 401);
  const spec = await f.send("/docs/openapi.json");
  assert.equal(spec.status, 200);
  assert.equal((await spec.json()).openapi, "3.1.0");
  assert.equal((await f.send("/docs/swagger-ui.css")).status, 200);
  assert.equal((await f.send("/docs/swagger-ui-bundle.js")).status, 200);
  assert.equal((await f.send("/docs/package.json")).status, 404);
  assert.equal((await f.send("/docs/toString")).status, 404);
  assert.equal((await f.send("/docs?key=anything")).status, 400);
  const logout = await f.send("/docs/logout", "POST");
  assert.ok(logout.headers.get("set-cookie")?.includes("Max-Age=0"));
});

test("request limits, invalid JSON/media types, multipart validation and internal errors have explicit errors", async () => {
  const f = fixture();
  const badJson = new Request("http://localhost/api/v1/prints", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: "{",
  });
  const response = await dispatchApi(badJson, ["prints"], f.operations, handleDocs);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "invalid_json");
  assert.equal((await f.send("/prints", "POST")).status, 415);
  await assert.rejects(readBody(new Request("http://localhost", { method: "POST", body: "12345" }), 4), ApiError);
  await assert.rejects(readBody(new Request("http://localhost", {
    method: "POST", headers: { "Content-Length": String(3 * 1024 * 1024 + 1) }, body: "{}",
  }), 3 * 1024 * 1024), ApiError);
  const exactJsonLimit = new Request("http://localhost", { method: "POST", body: " ".repeat(3 * 1024 * 1024) });
  assert.equal((await readBody(exactJsonLimit, 3 * 1024 * 1024)).length, 3 * 1024 * 1024);
  const tooLargeUpload = new Request("http://localhost/api/v1/prints/upload", {
    method: "POST", headers: { Authorization: `Bearer ${key}`,
      "Content-Type": "multipart/form-data; boundary=test", "Content-Length": String(100 * 1024 * 1024 + 1) },
    body: "test",
  });
  assert.equal((await dispatchApi(tooLargeUpload, ["prints", "upload"], f.operations, handleDocs)).status, 413);
  const form = new FormData();
  form.set("file", new File(["not an archive"], "test.3mf"));
  const upload = new Request("http://localhost/api/v1/prints/upload", {
    method: "POST", body: form, headers: { Authorization: `Bearer ${key}` },
  });
  assert.equal((await dispatchApi(upload, ["prints", "upload"], f.operations, handleDocs)).status, 201);
  form.set("mode", "manual");
  const invalid = new Request(upload.url, { method: "POST", body: form, headers: { Authorization: `Bearer ${key}` } });
  assert.equal((await dispatchApi(invalid, ["prints", "upload"], f.operations, handleDocs)).status, 400);
  assert.equal(f.calls.filter((call) => call === "upload").length, 1);
  const error = errorResponse(new ApiError(409, "conflict", "Conflict"));
  assert.equal(error.status, 409);
});
