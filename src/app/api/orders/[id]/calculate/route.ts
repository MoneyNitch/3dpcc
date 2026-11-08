import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api/http";
import { authorize } from "@/lib/auth/server";
import { listOrders, saveOrder } from "@/lib/db";
import {
  calculateOrderSnapshot, orderCalculationInputsSchema, orderCalculationMatchesItems,
  orderCalculationSnapshotSchema, orderItemCostsSchema,
} from "@/lib/orderCalculation";
import { loadOrderCalculation } from "@/lib/orderCalculationServer";
import { readOrderBody } from "@/lib/orders";

type Context = { params: Promise<{ id: string }> };
const saveSchema = z.strictObject({
  expectedUpdatedAt: z.iso.datetime(),
  currency: orderCalculationSnapshotSchema.shape.currency,
  inputs: orderCalculationInputsSchema,
  itemCosts: z.array(orderItemCostsSchema).min(1).max(100),
  refresh: z.boolean(),
});

async function findOrder(id: string) {
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "not_found", "Auftrag nicht gefunden.");
  const order = (await listOrders()).find((item) => item.id === id);
  if (!order) throw new ApiError(404, "not_found", "Auftrag nicht gefunden.");
  return order;
}

function handleError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Order calculation failed:", error);
  return NextResponse.json({ error: "Die Auftragskalkulation konnte nicht verarbeitet werden." }, { status: 500 });
}

export async function GET(request: Request, { params }: Context) {
  const denied = await authorize(request, "documents.read");
  if (denied) return denied;
  try {
    const order = await findOrder((await params).id);
    const snapshot = order.calculation ?? await loadOrderCalculation(order);
    return NextResponse.json({
      calculation: calculateOrderSnapshot(snapshot), snapshot,
      saved: Boolean(order.calculation), outdated: !orderCalculationMatchesItems(order, snapshot),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request, { params }: Context) {
  const denied = await authorize(request, "documents.write");
  if (denied) return denied;
  try {
    const order = await findOrder((await params).id);
    const parsed = saveSchema.safeParse(await readOrderBody(request));
    if (!parsed.success) throw new ApiError(400, "validation_error", "Bitte prüfe die Kalkulationswerte.");
    const { expectedUpdatedAt, currency, inputs, itemCosts, refresh } = parsed.data;
    if (expectedUpdatedAt !== order.updatedAt) {
      throw new ApiError(409, "conflict", "Der Auftrag wurde geändert. Bitte die Seite neu laden.");
    }
    if (order.calculation && !refresh && !orderCalculationMatchesItems(order, order.calculation)) {
      throw new ApiError(409, "conflict", "Die Auftragspositionen wurden geändert. Bitte die Kosten ausdrücklich neu berechnen.");
    }
    const basis = refresh || !order.calculation ? await loadOrderCalculation(order) : order.calculation;
    if (basis.currency !== currency || (order.calculation && basis.currency !== order.calculation.currency)) {
      throw new ApiError(409, "conflict", "Die Währung wurde geändert. Eine automatische Umrechnung der Auftragskalkulation ist nicht möglich.");
    }
    const costsById = new Map(itemCosts.map((item) => [item.printId, item]));
    if (!refresh && (costsById.size !== itemCosts.length || basis.items.length !== costsById.size ||
      basis.items.some((item) => !costsById.has(item.printId)))) {
      throw new ApiError(400, "validation_error", "Die Kalkulationspositionen stimmen nicht mit dem Auftrag überein.");
    }
    const snapshot = orderCalculationSnapshotSchema.parse({
      ...basis, savedAt: new Date().toISOString(), inputs,
      items: basis.items.map((item) => refresh ? item : { ...item, ...costsById.get(item.printId) }),
    });
    const updated = { ...order, calculation: snapshot, updatedAt: snapshot.savedAt };
    const saved = await saveOrder(updated);
    return NextResponse.json({ order: saved }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleError(error);
  }
}
