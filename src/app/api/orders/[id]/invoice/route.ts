import { z } from "zod";
import { authorize } from "@/lib/auth/server";
import { ApiError, readJson } from "@/lib/api/http";
import { getPrint, listOrders, getSettings, updateSettings } from "@/lib/db";
import { formatDocumentNumber } from "@/lib/invoice";
import { renderOrderInvoice } from "@/lib/orderInvoice";

const schema = z.strictObject({
  expectedUpdatedAt: z.iso.datetime(),
  templateId: z.string().min(1).max(100),
  number: z.string().trim().min(1).max(100),
  automaticNumber: z.boolean(),
  preview: z.boolean(),
  date: z.iso.date(),
  dueDate: z.union([z.iso.date(), z.literal("")]),
  customerName: z.string().trim().min(1).max(500),
  customerAddress: z.string().max(5000),
  showQuantityDiscount: z.boolean(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await authorize(request, "documents.write");
  if (denied) return denied;
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new ApiError(400, "input", "orders.invoice.invalid");
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, "input", "orders.invoice.invalid");
    const details = parsed.data;
    const [orders, settings] = await Promise.all([listOrders(), getSettings()]);
    const order = orders.find((entry) => entry.id === id);
    if (!order) throw new ApiError(404, "not_found", "orders.invoice.notFound");
    if (order.updatedAt !== details.expectedUpdatedAt) throw new ApiError(409, "conflict", "orders.invoice.changed");
    const sources = await Promise.all(order.items.map(async (item) => {
      const print = await getPrint(item.printId);
      if (!print) throw new ApiError(404, "print", "orders.invoice.missingPrint");
      const plates = print.plates ?? [print.plate];
      return {
        weightGrams: plates.reduce((sum, plate) => sum + plate.totalWeightGrams, 0) * item.quantity,
        durationSeconds: plates.reduce((sum, plate) => sum + plate.totalPrintTimeSeconds, 0) * item.quantity,
      };
    }));
    const html = await renderOrderInvoice(order, settings, details, {
      weightGrams: sources.reduce((sum, item) => sum + item.weightGrams, 0),
      durationSeconds: sources.reduce((sum, item) => sum + item.durationSeconds, 0),
    });
    if (!details.preview && details.automaticNumber) {
      await updateSettings((current) => {
        if (formatDocumentNumber(current.numbering.invoice) !== details.number) {
          throw new ApiError(409, "number", "orders.invoice.numberChanged");
        }
        if (current.numbering.invoice.nextNumber >= 1_000_000_000) {
          throw new ApiError(409, "number", "orders.invoice.numberLimit");
        }
        return { ...current, numbering: { ...current.numbering,
          invoice: { ...current.numbering.invoice, nextNumber: current.numbering.invoice.nextNumber + 1 } } };
      });
    }
    return Response.json({ html, number: details.number }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Could not create order invoice:", error);
    return Response.json({ error: "orders.invoice.failed" }, { status: 500 });
  }
}
