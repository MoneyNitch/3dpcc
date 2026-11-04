import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

test("real routes enforce bootstrap, browser sessions, custom rights, user-bound API keys and login opt-out", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pcc-auth-routes-"));
  const requireModule = createRequire(import.meta.url);
  const moduleUrl = (relative: string) => JSON.stringify(new URL(relative, import.meta.url).href);
  const script = `
    import assert from "node:assert/strict";
    import { NextRequest } from ${JSON.stringify(pathToFileURL(requireModule.resolve("next/server")).href)};
    import * as auth from ${moduleUrl("../../app/api/auth/route.ts")};
    import * as users from ${moduleUrl("../../app/api/users/route.ts")};
    import * as prints from ${moduleUrl("../../app/api/prints/route.ts")};
    import * as print from ${moduleUrl("../../app/api/prints/[id]/route.ts")};
    import * as model from ${moduleUrl("../../app/api/prints/[id]/model/route.ts")};
    import * as plates from ${moduleUrl("../../app/api/prints/[id]/plates/route.ts")};
    import * as download from ${moduleUrl("../../app/api/prints/[id]/download/route.ts")};
    import * as settings from ${moduleUrl("../../app/api/settings/route.ts")};
    import * as database from ${moduleUrl("../../app/api/db-settings/route.ts")};
    import * as integrations from ${moduleUrl("../../app/api/filament-connections/route.ts")};
    import * as spools from ${moduleUrl("../../app/api/filament-spools/route.ts")};
    import * as queue from ${moduleUrl("../../app/api/preview-queue/route.ts")};
    import * as support from ${moduleUrl("../../app/api/support-export/route.ts")};
    import * as backup from ${moduleUrl("../../app/api/backup/route.ts")};
    import * as orders from ${moduleUrl("../../app/api/orders/route.ts")};
    import * as order from ${moduleUrl("../../app/api/orders/[id]/route.ts")};
    import * as v1 from ${moduleUrl("../../app/api/v1/[[...path]]/route.ts")};
    import { getAuthStore } from ${moduleUrl("./store.ts")};
    const password = "a-long-test-password";
    const ctx = { params: Promise.resolve({ id: "12345678-1234-4234-8234-123456789abc" }) };
    function request(method = "GET", body, cookie = "", key = "", origin = "http://localhost") {
      return new NextRequest("http://localhost/api/test", {
        method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(key ? { Authorization: "Bearer " + key } : {}),
          ...(origin ? { Origin: origin } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    }
    const cookie = (response) => response.headers.get("set-cookie").split(";")[0];
    async function login(username, password, rememberMe = false) {
      const response = await auth.POST(request("POST", { action: "login", username, password, rememberMe }));
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      return response;
    }
    const reads = [prints.GET, (r) => print.GET(r, ctx), (r) => model.GET(r, ctx), (r) => download.GET(r, ctx),
      settings.GET, database.GET, spools.GET, queue.GET, support.GET, orders.GET, users.GET];
    for (const handler of reads) assert.equal((await handler(request())).status, 401);
    const writes = [
      ["POST", prints.POST], ["DELETE", (r) => print.DELETE(r, ctx)], ["PUT", (r) => print.PUT(r, ctx)],
      ["PATCH", (r) => print.PATCH(r, ctx)], ["POST", (r) => model.POST(r, ctx)],
      ["POST", (r) => plates.POST(r, ctx)], ["PATCH", (r) => plates.PATCH(r, ctx)],
      ["PUT", settings.PUT], ["PUT", database.PUT], ["PUT", integrations.PUT],
      ["PATCH", queue.PATCH], ["DELETE", queue.DELETE], ["POST", support.POST], ["POST", users.POST],
      ["POST", backup.POST], ["PUT", backup.PUT], ["POST", orders.POST],
      ["PUT", (r) => order.PUT(r, ctx)], ["DELETE", (r) => order.DELETE(r, ctx)],
    ];
    for (const [method, handler] of writes) assert.equal((await handler(request(method, {}))).status, 401);
    const initial = await login("admin", "admin");
    const initialCookie = cookie(initial);
    assert.match(initial.headers.get("set-cookie"), /Max-Age=43200/);
    assert.equal((await initial.json()).redirect, "/account");
    assert.equal((await prints.GET(request("GET", undefined, initialCookie))).status, 403);
    assert.equal((await users.GET(request("GET", undefined, initialCookie))).status, 403);
    const changed = await auth.POST(request("POST", { action: "change", username: "owner", oldPassword: "admin", password }, initialCookie));
    assert.equal(changed.status, 200);
    const ownerCookie = cookie(changed);
    assert.equal((await prints.GET(request("GET", undefined, initialCookie))).status, 401);
    const owner = (await auth.GET(request("GET", undefined, ownerCookie)).then((r) => r.json())).user;
    const rememberedLogin = await login("owner", password, true);
    const rememberedCookie = cookie(rememberedLogin);
    assert.match(rememberedLogin.headers.get("set-cookie"), /Max-Age=2592000/);
    assert.equal((await auth.GET(request("GET", undefined, rememberedCookie)).then((r) => r.json())).user.id, owner.id);
    assert.equal((await users.GET(request("GET", undefined, ownerCookie))).status, 200);
    const createReader = await users.POST(request("POST", { action: "saveUser", data: { username: "reader", roleId: "viewer", active: true, password } }, ownerCookie));
    assert.equal(createReader.status, 200);
    const readerLogin = await login("reader", password);
    const readerChanged = await auth.POST(request("POST", { action: "change", username: "reader", oldPassword: password, password: password + "-reader" }, cookie(readerLogin)));
    const readerCookie = cookie(readerChanged);
    assert.equal((await prints.GET(request("GET", undefined, readerCookie))).status, 200);
    assert.equal((await settings.GET(request("GET", undefined, readerCookie))).status, 200);
    assert.equal((await database.GET(request("GET", undefined, readerCookie))).status, 403);
    assert.equal((await support.GET(request("GET", undefined, readerCookie))).status, 403);
    for (const [method, handler] of writes) assert.equal((await handler(request(method, {}, readerCookie))).status, 403);
    const reader = getAuthStore().overview().users.find((u) => u.username === "reader");
    const keyResponse = await users.POST(request("POST", { action: "createKey", userId: reader.id, name: "viewer-api" }, ownerCookie));
    assert.equal(keyResponse.status, 200);
    const key = (await keyResponse.json()).token;
    const apiContext = (parts) => ({ params: Promise.resolve({ path: parts }) });
    assert.equal((await v1.GET(request("GET", undefined, readerCookie), apiContext(["prints"]))).status, 401);
    assert.equal((await v1.GET(request("GET", undefined, "", process.env.API_KEYS), apiContext(["prints"]))).status, 401);
    assert.equal((await v1.GET(request("GET", undefined, "", key), apiContext(["prints"]))).status, 200);
    assert.equal((await v1.POST(request("POST", {}, "", key), apiContext(["prints"]))).status, 403);
    assert.equal((await users.GET(request("GET", undefined, "", key))).status, 401);
    const policy = { minLength: 4, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecial: true };
    assert.equal((await users.POST(request("POST", { action: "savePasswordPolicy", data: policy }, readerCookie))).status, 403);
    assert.equal((await users.POST(request("POST", { action: "savePasswordPolicy", data: policy }, ownerCookie, "", "https://attacker.example"))).status, 403);
    assert.equal((await users.POST(request("POST", { action: "savePasswordPolicy", data: { ...policy, minLength: 3 } }, ownerCookie))).status, 400);
    assert.equal((await users.POST(request("POST", { action: "savePasswordPolicy", data: policy }, ownerCookie))).status, 200);
    assert.deepEqual((await users.GET(request("GET", undefined, ownerCookie)).then((r) => r.json())).passwordPolicy, policy);
    const invalidPassword = await users.POST(request("POST", { action: "saveUser", data: { username: "short", roleId: "viewer", active: true, password: "abc1" } }, ownerCookie));
    assert.equal(invalidPassword.status, 400);
    assert.equal((await invalidPassword.json()).error, "passwordUppercase");
    assert.equal((await users.POST(request("POST", { action: "saveUser", data: { username: "short", roleId: "viewer", active: true, password: "Aa1!" } }, ownerCookie))).status, 200);
    const shortLogin = await login("short", "Aa1!");
    const invalidChange = await auth.POST(request("POST", { action: "change", username: "short", oldPassword: "Aa1!", password: "Bb2c" }, cookie(shortLogin)));
    assert.equal(invalidChange.status, 400);
    assert.equal((await invalidChange.json()).error, "passwordSpecial");
    assert.equal((await auth.POST(request("POST", { action: "change", username: "short", oldPassword: "Aa1!", password: "Bb2?" }, cookie(shortLogin)))).status, 200);
    await login("owner", password);
    const relaxed = { ...policy, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSpecial: false };
    assert.equal((await users.POST(request("POST", { action: "savePasswordPolicy", data: relaxed }, ownerCookie))).status, 200);
    const shortUser = getAuthStore().overview().users.find((u) => u.username === "short");
    assert.equal((await users.POST(request("POST", { action: "saveUser", id: shortUser.id, data: { username: "short", roleId: "viewer", active: true, password: "1234" } }, ownerCookie))).status, 200);
    const resetLogin = await login("short", "1234");
    assert.equal((await auth.POST(request("POST", { action: "change", username: "short", oldPassword: "1234", password: "abcd" }, cookie(resetLogin)))).status, 200);
    const docsLogin = await v1.POST(request("POST", undefined, "", key), apiContext(["docs"]));
    assert.equal(docsLogin.status, 200);
    const docsCookie = cookie(docsLogin);
    assert.equal((await v1.GET(request("GET", undefined, docsCookie), apiContext(["docs", "openapi.json"]))).status, 200);
    assert.equal((await v1.GET(request("GET", undefined, docsCookie), apiContext(["prints"]))).status, 401);
    assert.equal((await prints.GET(request("GET", undefined, docsCookie))).status, 401);
    const keyId = getAuthStore().overview().keys[0].id;
    assert.equal((await users.POST(request("POST", { action: "regenerateKey", id: keyId }, readerCookie))).status, 403);
    assert.equal((await users.POST(request("POST", { action: "regenerateKey", id: keyId }, ownerCookie, "", "https://attacker.example"))).status, 403);
    assert.equal((await users.POST(request("POST", { action: "regenerateKey", id: "invalid" }, ownerCookie))).status, 400);
    assert.equal((await users.POST(request("POST", { action: "regenerateKey", id: "12345678-1234-4234-8234-123456789abc" }, ownerCookie))).status, 404);
    const regeneratedResponse = await users.POST(request("POST", { action: "regenerateKey", id: keyId }, ownerCookie));
    assert.equal(regeneratedResponse.status, 200);
    assert.equal(regeneratedResponse.headers.get("cache-control"), "private, no-store");
    const regeneratedKey = (await regeneratedResponse.json()).token;
    assert.notEqual(regeneratedKey, key);
    assert.equal((await v1.GET(request("GET", undefined, "", key), apiContext(["prints"]))).status, 401);
    assert.equal((await v1.GET(request("GET", undefined, "", regeneratedKey), apiContext(["prints"]))).status, 200);
    assert.equal((await v1.GET(request("GET", undefined, docsCookie), apiContext(["docs", "openapi.json"]))).status, 401);
    const keyOverview = await users.GET(request("GET", undefined, ownerCookie)).then((r) => r.json());
    assert.ok(keyOverview.keys.some((entry) => entry.id === keyId && entry.name === "viewer-api" && entry.userId === reader.id));
    assert.ok(!JSON.stringify(keyOverview).includes(regeneratedKey));
    assert.equal((await users.POST(request("POST", { action: "revokeKey", id: keyId }, ownerCookie))).status, 200);
    assert.equal((await v1.GET(request("GET", undefined, "", regeneratedKey), apiContext(["prints"]))).status, 401);
    assert.equal((await v1.GET(request("GET", undefined, "", key), apiContext(["prints"]))).status, 401);
    assert.equal((await v1.GET(request("GET", undefined, docsCookie), apiContext(["docs", "openapi.json"]))).status, 401);
    assert.equal((await auth.POST(request("POST", { action: "logout" }, ownerCookie, "", "https://attacker.example"))).status, 403);
    const store = getAuthStore();
    store.saveRole(owner.id, undefined, { name: "Documents", permissions: ["documents.write", "api.use"] });
    const role = store.overview().roles.find((r) => r.name === "Documents");
    await store.saveUser(owner.id, reader.id, { username: "reader", roleId: role.id, active: true });
    const customCookie = cookie(await login("reader", password + "-reader"));
    const current = (await settings.GET(request("GET", undefined, customCookie)).then((r) => r.json())).settings;
    current.numbering.invoice.nextNumber++;
    assert.equal((await settings.PUT(request("PUT", current, customCookie))).status, 200);
    current.general.companyName = "Not allowed";
    assert.equal((await settings.PUT(request("PUT", current, customCookie))).status, 403);
    const customKey = store.createApiKey(owner.id, reader.id, "documents-api");
    assert.equal((await v1.GET(request("GET", undefined, "", customKey), apiContext(["settings"]))).status, 200);
    assert.equal((await v1.PATCH(request("PATCH", { numbering: { invoice: { nextNumber: 10 } } }, "", customKey), apiContext(["settings"]))).status, 200);
    assert.equal((await v1.PATCH(request("PATCH", { general: { companyName: "Not allowed" } }, "", customKey), apiContext(["settings"]))).status, 403);
    assert.equal((await auth.POST(request("POST", { action: "logout" }, customCookie))).status, 200);
    assert.equal((await settings.GET(request("GET", undefined, customCookie))).status, 401);
    process.env.AUTH_ENABLED = "false";
    assert.equal((await prints.GET(request())).status, 200);
    assert.equal((await auth.POST(request("POST", { action: "login", username: "admin", password: "admin" }))).status, 404);
    assert.equal((await v1.GET(request("GET", undefined, "", process.env.API_KEYS), apiContext(["prints"]))).status, 200);
    console.log("Authentication route integration verified");
  `;
  try {
    const result = spawnSync(process.execPath, [
      "--import", pathToFileURL(requireModule.resolve("tsx")).href, "--input-type=module", "--eval", script,
    ], {
      cwd: directory, env: { ...process.env, AUTH_ENABLED: "true", AUTH_ORIGIN: "", AUTH_COOKIE_SECURE: "false",
        API_KEYS: "c".repeat(43), TSX_TSCONFIG_PATH: path.resolve("tsconfig.json") },
      encoding: "utf8", timeout: 60_000,
    });
    assert.equal(result.status, 0, `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`);
    assert.ok(result.stdout.includes("Authentication route integration verified"));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
