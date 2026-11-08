import { z } from "zod";
import { ApiError, readBody } from "./api/http";
import { CURRENCY_CODES } from "./currency";

export const orderStatusSchema = z.enum(["open", "in_progress", "ready", "completed", "cancelled"]);
export const orderPrioritySchema = z.enum(["low", "normal", "high"]);
export const paymentStatusSchema = z.enum(["unpaid", "partial", "paid", "refunded"]);
export const shippingStatusSchema = z.enum(["not_shipped", "shipped", "delivered", "pickup"]);
const workflowFields = {
  paymentStatus: paymentStatusSchema.optional(),
  paymentMethod: z.string().trim().max(100).optional(),
  paidAmount: z.number().finite().min(0).max(1_000_000_000).optional(),
  paymentCurrency: z.enum(CURRENCY_CODES).optional(),
  shippingStatus: shippingStatusSchema.optional(),
  shippingMethod: z.string().trim().max(100).optional(),
  trackingNumber: z.string().trim().max(200).optional(),
};
export const orderQuickUpdateSchema = z.strictObject({
  expectedUpdatedAt: z.iso.datetime().optional(),
  status: orderStatusSchema.optional(),
  priority: orderPrioritySchema.optional(),
  ...workflowFields,
}).refine((value) => Object.entries(value).some(([key, field]) => key !== "expectedUpdatedAt" && field !== undefined));
export type OrderQuickUpdate = z.infer<typeof orderQuickUpdateSchema>;

export const orderInputSchema = z.strictObject({
  customerName: z.string().trim().min(1).max(403),
  customerId: z.uuid().nullable().optional(),
  ...workflowFields,
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
