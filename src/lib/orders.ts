import { z } from "zod";
import { ApiError, readBody } from "./api/http";

export const orderStatusSchema = z.enum(["open", "in_progress", "ready", "completed", "cancelled"]);
export const orderPrioritySchema = z.enum(["low", "normal", "high"]);
export const orderQuickUpdateSchema = z.strictObject({
  status: orderStatusSchema.optional(),
  priority: orderPrioritySchema.optional(),
}).refine((value) => value.status !== undefined || value.priority !== undefined);

export const orderInputSchema = z.strictObject({
  customerName: z.string().trim().min(1).max(200),
  status: orderStatusSchema,
  priority: orderPrioritySchema.default("normal"),
  printerId: z.string().trim().min(1).max(128).nullable().default(null),
  dueDate: z.iso.date().nullable(),
  notes: z.string().max(5000),
  items: z.array(z.strictObject({
    printId: z.uuid(),
    quantity: z.number().int().positive().max(1_000_000),
  })).min(1).max(100).refine(
    (items) => new Set(items.map((item) => item.printId)).size === items.length,
    "Ein Druck darf pro Auftrag nur einmal aufgeführt werden.",
  ),
});

export type OrderInput = z.output<typeof orderInputSchema>;

export async function readOrderBody(request: Request): Promise<unknown> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    throw new ApiError(415, "unsupported_media_type", "Use Content-Type: application/json.");
  }
  const bytes = await readBody(request, 64 * 1024);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new ApiError(400, "invalid_json", "Request body is not valid UTF-8 JSON.");
  }
}
