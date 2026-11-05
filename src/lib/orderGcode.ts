import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ApiError } from "./api/http";

const supportedExtensions = new Set([".gcode", ".gco", ".gc"]);

export const maximumOrderGcodeBytes = 50 * 1024 * 1024;

export function normalizeOrderGcodeFileName(value: string): string {
  const fileName = value.replace(/\\/g, "/").split("/").pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "").trim() ?? "";
  if (!fileName || fileName.length > 255 || !supportedExtensions.has(path.extname(fileName).toLowerCase())) {
    throw new ApiError(400, "validation_error", "Bitte wähle eine gültige G-Code-Datei (.gcode, .gco oder .gc).");
  }
  return fileName;
}

export class OrderGcodeFiles {
  constructor(private readonly directory = path.join(process.cwd(), "data", "order-gcode")) {}

  private file(id: string): string {
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) {
      throw new ApiError(400, "validation_error", "Invalid order ID.");
    }
    return path.join(this.directory, `${id}.gcode`);
  }

  async save(id: string, buffer: Uint8Array): Promise<void> {
    const file = this.file(id);
    await mkdir(this.directory, { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, buffer, { flag: "wx", mode: 0o600 });
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async read(id: string): Promise<Buffer | null> {
    try {
      return await readFile(this.file(id));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await rm(this.file(id), { force: true });
  }
}

export const orderGcodeFiles = new OrderGcodeFiles();
