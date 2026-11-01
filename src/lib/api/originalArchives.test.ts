import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { OriginalArchives, originalDownload } from "../originalArchives";
import { ApiError } from "./http";
import type { ParsedPrint } from "../types";
import { defaultSettings, migrateSettings } from "../db/shared";

test("original archives preserve exact upload bytes and enforce download gates and source links", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pcc-original-test-"));
  const archives = new OriginalArchives(directory);
  const id = crypto.randomUUID();
  const linkedId = crypto.randomUUID();
  const print: ParsedPrint = {
    id, fileName: "Original ä.gcode.3mf", createdAt: new Date().toISOString(),
    plate: { totalWeightGrams: 1, printTimeSeconds: 1, totalPrintTimeSeconds: 1,
      layerCount: 1, nozzleDiameterMm: null, printerModelId: null, bedType: null,
      filaments: [], objects: [], categoryTotals: [], categoryByFilament: [], thumbnailBase64: null },
  };
  const linked: ParsedPrint = { ...print, id: linkedId, previewSource: { printId: id, plateIndex: 2 } };
  const bytes = Buffer.from([0x50, 0x4b, 0, 255, 13, 10, 100]);
  let enabled = true;
  const prints = new Map([[id, print], [linkedId, linked]]);
  const dependencies = { enabled: async () => enabled, archives,
    getPrint: async (id: string) => prints.get(id) ?? null };
  try {
    assert.equal(await archives.exists(id), false);
    await assert.rejects(originalDownload(id, dependencies), (error: unknown) => error instanceof ApiError && error.status === 404);
    await archives.save(id, bytes);
    assert.deepEqual(await archives.read(id), bytes);
    assert.equal(await archives.exists(id), true);
    assert.deepEqual(await readdir(directory), [`${id}.3mf`]);
    const response = await originalDownload(id, dependencies);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.ok(response.headers.get("content-disposition")?.includes("Original%20%C3%A4.gcode.3mf"));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    const source = await originalDownload(linkedId, dependencies);
    assert.deepEqual(Buffer.from(await source.arrayBuffer()), bytes);
    await archives.remove(linkedId);
    assert.equal(await archives.exists(id), true);
    enabled = false;
    await assert.rejects(originalDownload(id, dependencies), (error: unknown) =>
      error instanceof ApiError && error.status === 403 && error.code === "downloads_disabled");
    assert.equal(await archives.exists(id), true);
    enabled = true;
    assert.equal((await originalDownload(id, dependencies)).status, 200);
    prints.set(id, { ...print, manual: true });
    await assert.rejects(originalDownload(id, dependencies), (error: unknown) => error instanceof ApiError && error.status === 404);
    prints.delete(id);
    await assert.rejects(originalDownload(linkedId, dependencies), (error: unknown) => error instanceof ApiError && error.status === 404);
    await archives.remove(id);
    assert.equal(await archives.read(id), null);
    await assert.rejects(archives.save("../escape", bytes), ApiError);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("retention defaults off and existing settings migrate without losing explicit choices", () => {
  assert.equal(defaultSettings.general.retainOriginalArchives, false);
  const oldGeneral = Object.fromEntries(Object.entries(defaultSettings.general).filter(([key]) => key !== "retainOriginalArchives"));
  assert.equal(migrateSettings({ ...defaultSettings, general: oldGeneral }).general.retainOriginalArchives, false);
  assert.equal(migrateSettings({ ...defaultSettings, general: {
    ...oldGeneral, retainOriginalArchives: true,
  } }).general.retainOriginalArchives, true);
});
