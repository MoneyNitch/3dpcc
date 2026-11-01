import { z } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, "validation_error", "Invalid request data.", result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })));
  }
  return result.data;
}

export async function readBody(request: Request, limit: number): Promise<Uint8Array> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
    throw new ApiError(413, "payload_too_large", `Request body must not exceed ${limit} bytes.`);
  }
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError(413, "payload_too_large", `Request body must not exceed ${limit} bytes.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    throw new ApiError(415, "unsupported_media_type", "Use Content-Type: application/json.");
  }
  const bytes = await readBody(request, 3 * 1024 * 1024);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "invalid_json", "Request body is not valid UTF-8 JSON.");
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function privateResponse(response: Response): Response {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Authorization, Cookie");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    const response = json({ error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } }, error.status);
    if (error.status === 401) response.headers.set("WWW-Authenticate", 'Bearer realm="3D-PCC API"');
    return privateResponse(response);
  }
  console.error("3D-PCC API request failed:", error);
  return privateResponse(json({ error: { code: "internal_error", message: "The request could not be completed. Check the server logs." } }, 500));
}

export async function fromInternal(response: Response): Promise<Response> {
  if (response.status < 400) return response;
  const codes: Record<number, string> = {
    400: "validation_error", 403: "preview_disabled", 404: "not_found",
    409: "conflict", 422: "invalid_archive", 500: "internal_error",
  };
  // Internal upload errors can contain filesystem/database details; never publish them.
  if (response.status >= 500 || response.status === 422) {
    console.error("3D-PCC API internal operation failed:", response.status, await response.text());
    throw new ApiError(response.status, codes[response.status] ?? "operation_failed",
      response.status === 422 ? "The 3MF archive could not be processed." : "The operation could not be completed.");
  }
  const body: unknown = await response.json();
  const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error : "The operation could not be completed.";
  throw new ApiError(response.status, codes[response.status] ?? "operation_failed", message);
}
