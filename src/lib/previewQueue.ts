import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { setTimeout as sleep } from "node:timers/promises";
import type { AppSettings } from "./types";
import type { PreviewWorkerInput } from "./previewWorker";

type JobStatus = "queued" | "running" | "error" | "unavailable";
interface PreviewJob {
  status: JobStatus;
  createdAt: string;
}
interface QueueDependencies {
  directory: string;
  workerFile: string;
  getSettings(): Promise<AppSettings>;
  printExists(id: string): Promise<boolean>;
  saveModel(id: string, data: Buffer): Promise<void>;
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

  constructor(private readonly dependencies: QueueDependencies) {}

  private directory(id: string) {
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) throw new Error("Invalid preview job id.");
    return path.join(this.dependencies.directory, id);
  }

  private async saveJob(id: string, job: PreviewJob) {
    const file = path.join(this.directory(id), "job.json");
    await writeFile(file + ".tmp", JSON.stringify(job));
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
      return { status: job.status, createdAt: job.createdAt };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async status(id: string): Promise<JobStatus | null> {
    return (await this.readJob(id))?.status ?? null;
  }

  async enqueue(id: string, source: Buffer) {
    await mkdir(this.directory(id), { recursive: true });
    await writeFile(path.join(this.directory(id), "source.3mf"), source);
    await this.saveJob(id, { status: "queued", createdAt: new Date().toISOString() });
  }

  async retry(id: string) {
    if (await this.status(id) !== "error") throw new Error("Only failed preview jobs can be retried.");
    await this.saveJob(id, { status: "queued", createdAt: new Date().toISOString() });
  }

  async cancel(id: string) {
    if (this.active?.id === id) {
      const active = this.active;
      this.active = undefined;
      await active.worker.terminate();
      await this.pending;
    }
    await rm(this.directory(id), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
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
      await mkdir(this.dependencies.directory, { recursive: true });
      const candidates: { id: string; createdAt: string }[] = [];
      for (const entry of await readdir(this.dependencies.directory, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const job = await this.readJob(entry.name);
        if (!job || (job.status !== "queued" && job.status !== "running")) continue;
        candidates.push({ id: entry.name, createdAt: job.createdAt });
      }
      candidates.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const job of candidates) {
        if (!await this.dependencies.printExists(job.id)) {
          await this.cancel(job.id);
          continue;
        }
        await this.saveJob(job.id, { status: "running", createdAt: job.createdAt });
        if (this.stopped) return;
        const sharedBudget = new SharedArrayBuffer(8);
        const budget = new Int32Array(sharedBudget);
        Atomics.store(budget, 0, duty);
        const directory = this.directory(job.id);
        const workerData: PreviewWorkerInput = {
          source: path.join(directory, "source.3mf"),
          output: path.join(directory, "result.gz"),
          budget: sharedBudget,
        };
        let worker: Worker;
        try {
          worker = new Worker(this.dependencies.workerFile, { workerData });
        } catch (error) {
          console.error(`Could not start preview worker for ${job.id}:`, error);
          await this.saveJob(job.id, { status: "error", createdAt: job.createdAt });
          continue;
        }
        this.active = { id: job.id, worker, budget };
        this.pending = this.complete(job.id, job.createdAt, worker);
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

  private async complete(id: string, createdAt: string, worker: Worker) {
    try {
      const available = await new Promise<boolean>((resolve, reject) => {
        let result: boolean | undefined;
        worker.once("message", (message: unknown) => {
          if (message && typeof message === "object" && "available" in message && typeof message.available === "boolean") {
            result = message.available;
          }
        });
        worker.once("error", reject);
        worker.once("exit", (code) => {
          if (code !== 0 || result === undefined) reject(new Error(`Preview worker exited without a result (code ${code}).`));
          else resolve(result);
        });
      });
      if (this.active?.worker !== worker) return;
      if (!await this.dependencies.printExists(id)) {
        await rm(this.directory(id), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } else if (available) {
        await this.dependencies.saveModel(id, await readFile(path.join(this.directory(id), "result.gz")));
        await rm(this.directory(id), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } else {
        await this.saveJob(id, { status: "unavailable", createdAt });
        await rm(path.join(this.directory(id), "source.3mf"), { force: true });
      }
    } catch (error) {
      if (this.active?.worker !== worker) return;
      console.error(`Preview job ${id} failed:`, error);
      try {
        await this.saveJob(id, { status: "error", createdAt });
      } catch (stateError) {
        console.error(`Could not persist preview failure for ${id}:`, stateError);
      }
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
