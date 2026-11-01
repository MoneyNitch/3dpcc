import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ParsedPrint } from "./types";
import { ApiError } from "./api/http";

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export class OriginalArchives {
  constructor(private readonly directory = path.join(process.cwd(), "data", "original-archives")) {}

  private file(id: string): string {
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) {
      throw new ApiError(400, "validation_error", "Invalid print ID.");
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

  async exists(id: string): Promise<boolean> {
    try {
      return (await stat(this.file(id))).isFile();
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  async read(id: string): Promise<Buffer | null> {
    try {
      return await readFile(this.file(id));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await rm(this.file(id), { force: true });
  }
}

export const originalArchives = new OriginalArchives();

export async function originalDownload(
  id: string,
  dependencies: {
    enabled(): Promise<boolean>;
    getPrint(id: string): Promise<ParsedPrint | null>;
    archives: OriginalArchives;
  },
): Promise<Response> {
  if (!await dependencies.enabled()) {
    throw new ApiError(403, "downloads_disabled", "Original archive downloads are disabled in settings.");
  }
  const print = await dependencies.getPrint(id);
  if (!print || print.manual) throw new ApiError(404, "not_found", "Original archive not found.");
  const source = print.previewSource ? await dependencies.getPrint(print.previewSource.printId) : print;
  if (!source) throw new ApiError(404, "not_found", "Source print not found.");
  const archive = await dependencies.archives.read(source.id);
  if (!archive) {
    throw new ApiError(404, "not_found", "No original archive was retained. Upload the file again with downloads enabled.");
  }
  const fileName = source.fileName.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, "") || "print.3mf";
  const encodedName = encodeURIComponent(fileName).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(new Uint8Array(archive), { headers: {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="print.3mf"; filename*=UTF-8''${encodedName}`,
    "Content-Length": String(archive.byteLength),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
