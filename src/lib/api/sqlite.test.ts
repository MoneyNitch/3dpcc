import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

test("API writes survive reopening the SQLite backend in an isolated data directory", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pcc-api-test-"));
  const requireModule = createRequire(import.meta.url);
  const script = `
    import assert from "node:assert/strict";
    import { createSqliteStore } from ${JSON.stringify(new URL("../db/sqliteStore.ts", import.meta.url).href)};
    import { createOperations } from ${JSON.stringify(new URL("./operations.ts", import.meta.url).href)};
    import { dispatchApi } from ${JSON.stringify(new URL("./router.ts", import.meta.url).href)};
    import { POST as upload } from ${JSON.stringify(new URL("../../app/api/prints/route.ts", import.meta.url).href)};
    import { GET as download } from ${JSON.stringify(new URL("../../app/api/prints/[id]/download/route.ts", import.meta.url).href)};
    import { PATCH as rename } from ${JSON.stringify(new URL("../../app/api/prints/[id]/plates/route.ts", import.meta.url).href)};
    import { originalArchives } from ${JSON.stringify(new URL("../originalArchives.ts", import.meta.url).href)};
    import { deletePrint } from ${JSON.stringify(new URL("../db/index.ts", import.meta.url).href)};
    import { POST as createOrder } from ${JSON.stringify(new URL("../../app/api/orders/route.ts", import.meta.url).href)};
    import { PUT as updateOrder, DELETE as deleteOrder } from ${JSON.stringify(new URL("../../app/api/orders/[id]/route.ts", import.meta.url).href)};
    import { DELETE as deletePrintRoute } from ${JSON.stringify(new URL("../../app/api/prints/[id]/route.ts", import.meta.url).href)};
    import AdmZip from ${JSON.stringify(pathToFileURL(requireModule.resolve("adm-zip")).href)};
    const store = createSqliteStore();
    const unexpected = async () => { throw new Error("Unexpected preview operation"); };
    const operations = createOperations({
      store, upload: unexpected, splitPlates: unexpected, model: unexpected,
      retryModel: unexpected, cancelPreview: async () => {}, settingsChanged: async () => {},
    });
    async function send(path, method, body) {
      const request = new Request("http://localhost/api/v1" + path, {
        method, headers: { Authorization: "Bearer " + process.env.API_KEYS, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return dispatchApi(request, path.slice(1).split("/"), operations, unexpected);
    }
    const created = await send("/prints", "POST", {
      name: "Persistent API print", minutes: 30,
      filaments: [{ filamentId: "1", type: "PLA", color: "#CCCCCC", usedGramsTotal: 50 }],
    });
    assert.equal(created.status, 201);
    const { print } = await created.json();
    assert.equal((await send("/prints/" + print.id + "/cost-inputs", "PUT", { quantity: 4 })).status, 200);
    assert.equal((await send("/settings", "PATCH", { general: { companyName: "API test" } })).status, 200);
    const reopened = createSqliteStore();
    assert.equal((await reopened.getPrint(print.id)).displayName, "Persistent API print");
    assert.equal((await reopened.getPrintCostInputs(print.id)).quantity, 4);
    const renameResponse = await rename(new Request("http://localhost", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plateIndex: 1, plateName: "Named plate" }),
    }), { params: Promise.resolve({ id: print.id }) });
    assert.equal(renameResponse.status, 200);
    assert.equal((await reopened.getPrint(print.id)).plate.plateName, "Named plate");
    assert.equal((await reopened.getSettings()).general.companyName, "API test");
    const orderBody = {
      customerName: "Persistent customer", status: "open", dueDate: "2026-12-01",
      notes: "Test order", items: [{ printId: print.id, quantity: 2 }],
    };
    const createdOrder = await createOrder(new Request("http://localhost/api/orders", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(orderBody),
    }));
    assert.equal(createdOrder.status, 201);
    const { order } = await createdOrder.json();
    assert.equal((await reopened.listOrders())[0].customerName, "Persistent customer");
    await assert.rejects(reopened.deletePrint(print.id), /einem Auftrag zugeordnet/);
    assert.ok(await reopened.getPrint(print.id));
    const linkedDelete = await deletePrintRoute(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: print.id }),
    });
    assert.equal(linkedDelete.status, 409);
    const updatedOrder = await updateOrder(new Request("http://localhost/api/orders/" + order.id, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...orderBody, status: "in_progress" }),
    }), { params: Promise.resolve({ id: order.id }) });
    assert.equal(updatedOrder.status, 200);
    assert.equal((await reopened.listOrders())[0].status, "in_progress");
    assert.equal((await deleteOrder(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: order.id }),
    })).status, 200);
    assert.equal((await reopened.listOrders()).length, 0);
    assert.equal((await send("/prints/" + print.id, "DELETE")).status, 200);
    assert.equal(await reopened.getPrint(print.id), null);
    const zip = new AdmZip();
    zip.addFile("Metadata/slice_info.config", Buffer.from('<config><plate><metadata key="prediction" value="3600"/><metadata key="weight" value="100"/><filament id="1" type="PLA" color="#CCCCCC" used_m="30" used_g="100"/></plate></config>'));
    const archiveBytes = zip.toBuffer();
    async function uploadOriginal(enabled) {
      const settings = await store.getSettings();
      await store.saveSettings({ ...settings, general: { ...settings.general, enable3dPreview: false, retainOriginalArchives: enabled } });
      const form = new FormData();
      form.set("file", new File([archiveBytes], "original.gcode.3mf"));
      const response = await upload(new Request("http://localhost/api/prints", { method: "POST", body: form }));
      const data = await response.json();
      assert.equal(response.status, 201, JSON.stringify(data));
      return data.print.id;
    }
    const retainedId = await uploadOriginal(true);
    assert.deepEqual(await originalArchives.read(retainedId), archiveBytes);
    const downloaded = await download(new Request("http://localhost"), { params: Promise.resolve({ id: retainedId }) });
    assert.equal(downloaded.status, 200);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), archiveBytes);
    const apiDownload = await send("/prints/" + retainedId + "/download", "GET");
    assert.equal(apiDownload.status, 200);
    assert.deepEqual(Buffer.from(await apiDownload.arrayBuffer()), archiveBytes);
    const discardedId = await uploadOriginal(false);
    assert.equal(await originalArchives.exists(discardedId), false);
    assert.equal(await originalArchives.exists(retainedId), true);
    assert.equal((await download(new Request("http://localhost"), { params: Promise.resolve({ id: retainedId }) })).status, 403);
    assert.equal((await send("/prints/" + retainedId + "/download", "GET")).status, 403);
    const latest = await store.getSettings();
    await store.saveSettings({ ...latest, general: { ...latest.general, retainOriginalArchives: true } });
    assert.equal((await send("/prints/" + discardedId + "/download", "GET")).status, 404);
    assert.equal((await send("/prints/" + retainedId + "/download", "GET")).status, 200);
    await deletePrint(retainedId);
    assert.equal(await originalArchives.exists(retainedId), false);
    await deletePrint(discardedId);
    console.log("SQLite API persistence verified");
  `;
  try {
    const result = spawnSync(process.execPath, [
      "--import", pathToFileURL(requireModule.resolve("tsx")).href, "--input-type=module", "--eval", script,
    ], {
      cwd: directory, env: { ...process.env, AUTH_ENABLED: "false", API_KEYS: "c".repeat(43),
        TSX_TSCONFIG_PATH: path.resolve("tsconfig.json") },
      encoding: "utf8", timeout: 30_000,
    });
    assert.equal(result.status, 0, `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`);
    assert.ok(result.stdout.includes("SQLite API persistence verified"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
