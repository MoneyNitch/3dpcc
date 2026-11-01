import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import AdmZip from "adm-zip";
import { PreviewQueue } from "./previewQueue";
import { defaultSettings } from "./db/shared";
import type { ModelGeometry } from "./types";

const workerFile = path.join(process.cwd(), ".preview-worker", "previewWorker.js");

function archive(lines = 1) {
  const zip = new AdmZip();
  zip.addFile("Metadata/plate_1.gcode", Buffer.from("; FEATURE: Outer wall\n" +
    Array.from({ length: lines }, (_, i) => `G1 X${i + 1} Z${i / 1000} E1`).join("\n")));
  return zip.toBuffer();
}

async function eventually(check: () => Promise<boolean>) {
  const until = Date.now() + 30_000;
  while (!await check()) {
    if (Date.now() > until) throw new Error("Timed out waiting for preview job.");
    await sleep(20);
  }
}

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "3dpcc-preview-test-"));
  const prints = new Set<string>();
  const saved = new Map<string, Buffer>();
  const settings = structuredClone(defaultSettings);
  settings.general.previewComputePercent = 100;
  const dependencies = {
    directory,
    workerFile,
    getSettings: async () => settings,
    printExists: async (id: string) => prints.has(id),
    saveModel: async (id: string, data: Buffer, plateIndex?: number) => {
      saved.set(plateIndex === undefined ? id : `${id}:${plateIndex}`, data);
    },
  };
  const queue = new PreviewQueue(dependencies);
  return { directory, prints, saved, settings, dependencies, queue };
}

test("persists queued uploads and finishes one job at a time with complete geometry", async () => {
  const f = await fixture();
  try {
    const ids = [randomUUID(), randomUUID()];
    for (const id of ids) {
      f.prints.add(id);
      await f.queue.enqueue(id, archive(10));
    }
    assert.equal(await f.queue.status(ids[0]), "queued");
    await f.queue.tick();
    assert.equal(await f.queue.status(ids[0]), "running");
    assert.equal(await f.queue.status(ids[1]), "queued");
    await eventually(async () => f.saved.has(ids[0]));
    await eventually(async () => await f.queue.status(ids[0]) === null);
    await f.queue.tick();
    await eventually(async () => f.saved.has(ids[1]));
    const geometry: ModelGeometry = JSON.parse(gunzipSync(f.saved.get(ids[0])!).toString());
    assert.equal(geometry.colors.length, 10);
    assert.equal(geometry.positions.length, 60);
  } finally {
    await f.queue.stop();
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("computes and persists a distinct preview model for each requested plate", async () => {
  const f = await fixture();
  const id = randomUUID();
  const zip = new AdmZip();
  for (const [index, x] of [[1, 10], [2, 20]] as const) {
    zip.addFile(`Metadata/plate_${index}.gcode`, Buffer.from(
      `; FEATURE: Outer wall\nG1 X${x} Y0 Z0.2 E1\n`,
    ));
  }
  try {
    f.prints.add(id);
    await f.queue.enqueue(id, zip.toBuffer(), [1, 2]);
    await f.queue.tick();
    await eventually(async () => f.saved.has(`${id}:1`) && f.saved.has(`${id}:2`));

    const first = JSON.parse(gunzipSync(f.saved.get(`${id}:1`)!).toString()) as ModelGeometry;
    const second = JSON.parse(gunzipSync(f.saved.get(`${id}:2`)!).toString()) as ModelGeometry;
    assert.notDeepEqual(first.positions, second.positions);
  } finally {
    await f.queue.stop();
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("restarts an interrupted job from its retained original archive", async () => {
  const f = await fixture();
  const id = randomUUID();
  let restarted: PreviewQueue | undefined;
  try {
    f.prints.add(id);
    await f.queue.enqueue(id, archive(1000), [1]);
    await f.queue.tick();
    await f.queue.stop();
    assert.equal(await f.queue.status(id), "running");
    assert.ok((await readFile(path.join(f.directory, id, "source.3mf"))).length);
    restarted = new PreviewQueue(f.dependencies);
    await restarted.tick();
    await eventually(async () => f.saved.has(`${id}:1`));
    await eventually(async () => await restarted!.status(id) === null);
  } finally {
    await f.queue.stop();
    await restarted?.stop();
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("does not run disabled jobs and removes deleted print jobs", async () => {
  const f = await fixture();
  const id = randomUUID();
  try {
    f.prints.add(id);
    f.settings.general.enable3dPreview = false;
    await f.queue.enqueue(id, archive());
    await f.queue.tick();
    assert.equal(await f.queue.status(id), "queued");
    assert.equal(f.saved.size, 0);
    f.prints.delete(id);
    f.settings.general.enable3dPreview = true;
    await f.queue.tick();
    assert.equal(await f.queue.status(id), null);
  } finally {
    await f.queue.stop();
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("cancels active jobs without saving a result", async () => {
  const f = await fixture();
  const id = randomUUID();
  try {
    f.prints.add(id);
    await f.queue.enqueue(id, archive(20_000));
    await f.queue.tick();
    await f.queue.cancel(id);
    assert.equal(await f.queue.status(id), null);
    assert.equal(f.saved.size, 0);
  } finally {
    await f.queue.stop();
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("pauses an active worker when disabled and resumes it with the updated budget", async () => {
  const f = await fixture();
  const id = randomUUID();
  try {
    f.prints.add(id);
    f.settings.general.previewComputePercent = 10;
    await f.queue.enqueue(id, archive(50_000));
    await f.queue.tick();
    f.settings.general.enable3dPreview = false;
    await f.queue.tick();
    await sleep(250);
    assert.equal(f.saved.size, 0);
    assert.equal(await f.queue.status(id), "running");
    f.settings.general.enable3dPreview = true;
    f.settings.general.previewComputePercent = 100;
    await f.queue.tick();
    await eventually(async () => f.saved.has(id));
  } finally {
    await f.queue.stop();
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("retains failed jobs for explicit retry and deletes unsupported sources", async () => {
  const f = await fixture();
  const id = randomUUID();
  try {
    f.prints.add(id);
    await f.queue.enqueue(id, Buffer.from("invalid archive"));
    await f.queue.tick();
    await eventually(async () => await f.queue.status(id) === "error");
    await writeFile(path.join(f.directory, id, "source.3mf"), archive());
    await f.queue.retry(id);
    await f.queue.tick();
    await eventually(async () => f.saved.has(id));
    await eventually(async () => await f.queue.status(id) === null);
    const unsupported = randomUUID();
    f.prints.add(unsupported);
    await f.queue.enqueue(unsupported, new AdmZip().toBuffer());
    await f.queue.tick();
    await eventually(async () => await f.queue.status(unsupported) === "unavailable");
    await assert.rejects(readFile(path.join(f.directory, unsupported, "source.3mf")), { code: "ENOENT" });
  } finally {
    await f.queue.stop();
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("lists and persists reordered waiting jobs across restarts and schedules that order", async () => {
  const f = await fixture();
  let restarted: PreviewQueue | undefined;
  try {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    for (let i = 0; i < ids.length; i++) {
      f.prints.add(ids[i]);
      await f.queue.enqueue(ids[i], archive());
      await writeFile(path.join(f.directory, ids[i], "job.json"), JSON.stringify({
        status: "queued", createdAt: new Date(1000 + i).toISOString(),
      }));
    }
    assert.deepEqual((await f.queue.list()).map((job) => job.id), ids);
    assert.equal(await f.queue.move(ids[0], "up"), false);
    assert.equal(await f.queue.move(ids[2], "up"), true);
    assert.equal(await f.queue.move(ids[2], "up"), true);
    assert.deepEqual((await f.queue.list()).map((job) => job.id), [ids[2], ids[0], ids[1]]);
    await f.queue.stop();
    restarted = new PreviewQueue(f.dependencies);
    assert.deepEqual((await restarted.list()).map((job) => job.id), [ids[2], ids[0], ids[1]]);
    await restarted.tick();
    assert.equal(await restarted.status(ids[2]), "running");
    assert.equal(await restarted.move(ids[2], "down"), false);
    await eventually(async () => f.saved.has(ids[2]));
    await eventually(async () => await restarted!.status(ids[2]) === null);
    await restarted.cancel(ids[0]);
    assert.ok(f.prints.has(ids[0]));
    assert.equal(await restarted.status(ids[0]), null);
    await restarted.tick();
    await eventually(async () => f.saved.has(ids[1]));
  } finally {
    await f.queue.stop();
    await restarted?.stop();
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("serializes cancellation with scheduling so cancelled work cannot restart", async () => {
  const f = await fixture();
  const id = randomUUID();
  try {
    f.prints.add(id);
    await f.queue.enqueue(id, archive(10_000));
    await Promise.all([f.queue.tick(), f.queue.cancel(id), f.queue.tick()]);
    assert.equal(await f.queue.status(id), null);
    assert.equal(f.saved.size, 0);
    assert.equal(await f.queue.move(id, "down"), false);
    assert.ok(f.prints.has(id));
  } finally {
    await f.queue.stop();
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("throttling increases work time without dropping segments", async () => {
  const times: number[] = [];
  const source = archive(50_000);
  for (const duty of [100, 10]) {
    const f = await fixture();
    const id = randomUUID();
    try {
      f.settings.general.previewComputePercent = duty;
      f.prints.add(id);
      await f.queue.enqueue(id, source);
      const started = performance.now();
      await f.queue.tick();
      await eventually(async () => f.saved.has(id));
      times.push(performance.now() - started);
      const geometry: ModelGeometry = JSON.parse(gunzipSync(f.saved.get(id)!).toString());
      assert.equal(geometry.colors.length, 50_000);
    } finally {
      await f.queue.stop();
      await rm(f.directory, { recursive: true, force: true });
    }
  }
  assert.ok(times[1] > times[0] + 200, `Expected throttling to increase elapsed time: ${times.join(", ")}ms`);
});
