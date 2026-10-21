import { parentPort, workerData } from "node:worker_threads";
import { readFile, rename } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { geometrySteps } from "./threemf/parser";
import type { ModelGeometry } from "./types";

export interface PreviewWorkerInput {
  source: string;
  output: string;
  budget: SharedArrayBuffer;
}

function pause(budget: Int32Array, elapsed: number) {
  const duty = Math.max(1, Atomics.load(budget, 0));
  const rest = elapsed * (100 - duty) / duty;
  if (rest > 0) Atomics.wait(budget, 1, 0, rest);
  while (Atomics.load(budget, 0) === 0) Atomics.wait(budget, 0, 0, 1000);
}

async function* serialize(geometry: ModelGeometry, budget: Int32Array) {
  yield "{";
  let separator = "";
  let worked = 0;
  for (const [key, value] of Object.entries(geometry)) {
    yield separator + JSON.stringify(key) + ":";
    separator = ",";
    if (Array.isArray(value)) {
      yield "[";
      for (let offset = 0; offset < value.length; offset += 8192) {
        pause(budget, 0);
        const started = performance.now();
        const chunk = (offset ? "," : "") + JSON.stringify(value.slice(offset, offset + 8192)).slice(1, -1);
        worked += performance.now() - started;
        yield chunk;
        if (worked >= 10) {
          pause(budget, worked);
          worked = 0;
        }
      }
      yield "]";
    } else {
      yield JSON.stringify(value);
    }
  }
  yield "}";
}

async function main(input: PreviewWorkerInput) {
  const port = parentPort;
  if (!port) throw new Error("Preview computation must run in a worker.");
  const budget = new Int32Array(input.budget);
  const steps = geometrySteps(await readFile(input.source));
  let step;
  do {
    while (Atomics.load(budget, 0) === 0) Atomics.wait(budget, 0, 0, 1000);
    const started = performance.now();
    do {
      step = steps.next();
    } while (!step.done && performance.now() - started < 10);
    pause(budget, performance.now() - started);
  } while (!step.done);
  if (!step.value) {
    port.postMessage({ available: false });
    return;
  }
  await pipeline(Readable.from(serialize(step.value, budget)), createGzip(), createWriteStream(input.output + ".tmp"));
  await rename(input.output + ".tmp", input.output);
  port.postMessage({ available: true });
}

if (parentPort) {
  void main(workerData).catch((error: unknown) => {
    console.error("Preview worker failed:", error);
    throw error;
  });
}
