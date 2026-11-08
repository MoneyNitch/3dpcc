import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ApiError } from "./api/http";

export class ProductFiles {
  constructor(private readonly directory = path.join(process.cwd(), "data", "product-files")) {}

  private file(id: string): string {
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) {
      throw new ApiError(400, "validation_error", "Invalid product type ID.");
    }
    return path.join(this.directory, `${id}.3mf`);
  }

  async save(id: string, buffer: Buffer): Promise<void> {
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

export const productFiles = new ProductFiles();
