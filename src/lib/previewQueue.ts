import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { setTimeout as sleep } from "node:timers/promises";
import type { AppSettings, PreviewQueueEntry } from "./types";
import type { PreviewWorkerInput } from "./previewWorker";

type JobStatus = "queued" | "running" | "error" | "unavailable";
interface PreviewJob {
  status: JobStatus;
  createdAt: string;
  plateIndices?: number[];
}
interface QueueDependencies {
  directory: string;
  workerFile: string;
  getSettings(): Promise<AppSettings>;
  printExists(id: string): Promise<boolean>;
  saveModel(id: string, data: Buffer, plateIndex?: number): Promise<void>;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isJobStatus(value: unknown): value is JobStatus {
  return value === "queued" || value === "running" || value === "error" || value === "unavailable";
}

/** One worker per server, with atomic on-disk jobs shared across restarts, not replicas. */
export class PreviewQueue {
  private active?: { id: string; worker: Worker; budget: Int32Array };
  private ticking = false;
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  private stopped = false;
  private lock: Promise<unknown> = Promise.resolve();

  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = this.lock.then(action);
    this.lock = result.then(() => {}, () => {});
    return result;
  }

  constructor(private readonly dependencies: QueueDependencies) {}

  private directory(id: string) {
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) throw new Error("Invalid preview job id.");
    return path.join(this.dependencies.directory, id);
  }

  private async saveJob(id: string, job: PreviewJob) {
    const file = path.join(this.directory(id), "job.json");
    await this.atomicWrite(file, JSON.stringify(job));
  }

  private async atomicWrite(file: string, data: string) {
    await writeFile(file + ".tmp", data);
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(file + ".tmp", file);
        break;
      } catch (error) {
        // Windows readers and virus scanners can briefly lock the destination.
        if (attempt >= 7 || !(error instanceof Error) || !("code" in error) ||
          !["EPERM", "EACCES", "EBUSY"].includes(String(error.code))) throw error;
        await sleep(20 * (attempt + 1));
      }
    }
  }

  private async readJob(id: string): Promise<PreviewJob | null> {
    try {
      const job: unknown = JSON.parse(await readFile(path.join(this.directory(id), "job.json"), "utf8"));
      if (!job || typeof job !== "object" || !("status" in job) ||
        !isJobStatus(job.status) || !("createdAt" in job) || typeof job.createdAt !== "string") {
        throw new Error(`Invalid preview job state for ${id}.`);
      }
      if ("plateIndices" in job && (!Array.isArray(job.plateIndices) ||
        !job.plateIndices.every((index) => Number.isSafeInteger(index) && index > 0))) {
        throw new Error(`Invalid preview plate indexes for ${id}.`);
      }
      return {
        status: job.status,
        createdAt: job.createdAt,
        ...("plateIndices" in job ? { plateIndices: job.plateIndices as number[] } : {}),
      };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async status(id: string): Promise<JobStatus | null> {
    return (await this.readJob(id))?.status ?? null;
  }

  async enqueue(id: string, source: Buffer, plateIndices?: number[]) {
    return this.exclusive(async () => {
      await mkdir(this.directory(id), { recursive: true });
      await writeFile(path.join(this.directory(id), "source.3mf"), source);
      await this.saveJob(id, {
        status: "queued",
        createdAt: new Date().toISOString(),
        ...(plateIndices ? { plateIndices } : {}),
      });
    });
  }

  async retry(id: string) {
    return this.exclusive(async () => {
      const job = await this.readJob(id);
      if (job?.status !== "error") throw new Error("Only failed preview jobs can be retried.");
      await this.saveJob(id, {
        status: "queued",
        createdAt: new Date().toISOString(),
        ...(job.plateIndices ? { plateIndices: job.plateIndices } : {}),
      });
    });
  }

  async cancel(id: string) {
    return this.exclusive(() => this.cancelJob(id));
  }

  private async cancelJob(id: string) {
    if (this.active?.id === id) {
      const active = this.active;
      this.active = undefined;
      await active.worker.terminate();
    }
    await rm(this.directory(id), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }

  private async entries(): Promise<PreviewQueueEntry[]> {
    await mkdir(this.dependencies.directory, { recursive: true });
    const jobs: PreviewQueueEntry[] = [];
    for (const entry of await readdir(this.dependencies.directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const job = await this.readJob(entry.name);
      if (job) jobs.push({
        id: entry.name,
        ...job,
        status: job.status === "running" && this.active?.id !== entry.name ? "queued" : job.status,
      });
    }
    let order: unknown;
    try {
      order = JSON.parse(await readFile(path.join(this.dependencies.directory, "order.json"), "utf8"));
    } catch (error) {
      if (!isMissing(error)) throw error;
      order = [];
    }
    if (!Array.isArray(order) || !order.every((id): id is string => typeof id === "string")) {
      throw new Error("Invalid preview queue order.");
    }
    const rank = new Map(order.map((id, index) => [id, index]));
    const group = (job: PreviewQueueEntry) => job.status === "running" ? 0 : job.status === "queued" ? 1 : 2;
    return jobs.sort((a, b) => group(a) - group(b) ||
      (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) ||
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  async list(): Promise<PreviewQueueEntry[]> {
    return this.exclusive(() => this.entries());
  }

  async move(id: string, direction: "up" | "down"): Promise<boolean> {
    return this.exclusive(async () => {
      const waiting = (await this.entries()).filter((job) => job.status === "queued");
      const index = waiting.findIndex((job) => job.id === id);
      const target = index + (direction === "up" ? -1 : 1);
      if (index < 0 || target < 0 || target >= waiting.length) return false;
      [waiting[index], waiting[target]] = [waiting[target], waiting[index]];
      await this.atomicWrite(path.join(this.dependencies.directory, "order.json"), JSON.stringify(waiting.map((job) => job.id)));
      return true;
    });
  }

  start() {
    if (this.timer) return;
    this.stopped = false;
    const tick = () => { void this.tick().catch((error) => console.error("Preview queue scheduler failed:", error)); };
    this.timer = setInterval(tick, 2000);
    this.timer.unref();
    tick();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    while (this.ticking) await sleep(10);
    if (this.active) {
      const active = this.active;
      this.active = undefined;
      await active.worker.terminate();
    }
    await this.pending;
  }

  async tick() {
    return this.exclusive(() => this.tickLocked());
  }

  private async tickLocked() {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    try {
      const settings = await this.dependencies.getSettings();
      if (this.stopped) return;
      const duty = settings.general.enable3dPreview ? settings.general.previewComputePercent : 0;
      if (this.active) {
        Atomics.store(this.active.budget, 0, duty);
        Atomics.notify(this.active.budget, 0);
        return;
      }
      if (!duty) return;
      const candidates = (await this.entries()).filter((job) => job.status === "queued");
      for (const job of candidates) {
        if (!await this.dependencies.printExists(job.id)) {
          await this.cancelJob(job.id);
          continue;
        }
        await this.saveJob(job.id, {
          status: "running",
          createdAt: job.createdAt,
          ...(job.plateIndices ? { plateIndices: job.plateIndices } : {}),
        });
        if (this.stopped) return;
        const sharedBudget = new SharedArrayBuffer(8);
        const budget = new Int32Array(sharedBudget);
        Atomics.store(budget, 0, duty);
        const directory = this.directory(job.id);
        const workerData: PreviewWorkerInput = {
          source: path.join(directory, "source.3mf"),
          output: path.join(directory, "result.gz"),
          budget: sharedBudget,
          ...(job.plateIndices ? { plateIndices: job.plateIndices } : {}),
        };
        let worker: Worker;
        try {
          worker = new Worker(this.dependencies.workerFile, { workerData });
        } catch (error) {
          console.error(`Could not start preview worker for ${job.id}:`, error);
          await this.saveJob(job.id, {
            status: "error",
            createdAt: job.createdAt,
            ...(job.plateIndices ? { plateIndices: job.plateIndices } : {}),
          });
          continue;
        }
        this.active = { id: job.id, worker, budget };
        this.pending = this.complete(job.id, job.createdAt, worker, job.plateIndices);
        break;
      }
    } catch (error) {
      if (this.active) {
        Atomics.store(this.active.budget, 0, 0);
        Atomics.notify(this.active.budget, 0);
      }
      throw error;
    } finally {
      this.ticking = false;
    }
  }

  private async complete(id: string, createdAt: string, worker: Worker, plateIndices?: number[]) {
    try {
      const availablePlateIndices = await new Promise<(number | null)[]>((resolve, reject) => {
        let result: (number | null)[] | undefined;
        worker.once("message", (message: unknown) => {
          if (message && typeof message === "object" && "available" in message &&
            typeof message.available === "boolean" && "plateIndices" in message &&
            Array.isArray(message.plateIndices) &&
            message.plateIndices.every((index) => index === null ||
              (Number.isSafeInteger(index) && index > 0))) {
            result = message.plateIndices as (number | null)[];
          }
        });
        worker.once("error", reject);
        worker.once("exit", (code) => {
          if (code !== 0 || result === undefined) reject(new Error(`Preview worker exited without a result (code ${code}).`));
          else resolve(result);
        });
      });
      await this.exclusive(async () => {
        if (this.active?.worker !== worker) return;
        if (!await this.dependencies.printExists(id)) {
          await rm(this.directory(id), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
        } else if (availablePlateIndices.length > 0) {
          for (const plateIndex of availablePlateIndices) {
            const suffix = plateIndex === null ? "" : `.${plateIndex}`;
            await this.dependencies.saveModel(
              id,
              await readFile(path.join(this.directory(id), `result.gz${suffix}`)),
              plateIndex ?? undefined,
            );
          }
          await rm(this.directory(id), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
        } else {
          await this.saveJob(id, {
            status: "unavailable",
            createdAt,
            ...(plateIndices ? { plateIndices } : {}),
          });
          await rm(path.join(this.directory(id), "source.3mf"), { force: true });
        }
        this.active = undefined;
      });
    } catch (error) {
      await this.exclusive(async () => {
        if (this.active?.worker !== worker) return;
        console.error(`Preview job ${id} failed:`, error);
        try {
          await this.saveJob(id, {
            status: "error",
            createdAt,
            ...(plateIndices ? { plateIndices } : {}),
          });
        } catch (stateError) {
          console.error(`Could not persist preview failure for ${id}:`, stateError);
        }
        this.active = undefined;
      });
    } finally {
      if (this.active?.worker === worker) this.active = undefined;
    }
  }
}

declare global {
  var previewQueue: PreviewQueue | undefined;
}

export async function getPreviewQueue(): Promise<PreviewQueue> {
  if (!globalThis.previewQueue) {
    const db = await import("./db");
    globalThis.previewQueue ??= new PreviewQueue({
      directory: path.join(process.cwd(), "data", "preview-jobs"),
      workerFile: path.join(process.cwd(), ".preview-worker", "previewWorker.js"),
      getSettings: db.getSettings,
      printExists: async (id) => Boolean(await db.getPrint(id)),
      saveModel: db.savePrintModel,
    });
  }
  return globalThis.previewQueue;
}
