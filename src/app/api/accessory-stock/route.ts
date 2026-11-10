import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api/http";
import { accessoryStockMovementSchema } from "@/lib/api/schemas";
import { authorize } from "@/lib/auth/server";
import {
  applyAccessoryStockMovements,
  getPrint,
  getPrintCostInputs,
  getSettings,
  listAccessoryStockMovements,
  listOrders,
} from "@/lib/db";
import { defaultCostInputs } from "@/lib/costCalculator";
import type { AccessoryStockMovement, ExtraCostItem } from "@/lib/types";

const manualSchema = z.strictObject({
  action: z.enum(["receipt", "adjustment"]),
  accessoryId: z.string().min(1).max(100),
  quantity: z.number().int().min(-1_000_000_000).max(1_000_000_000).refine((value) => value !== 0),
});
const consumeSchema = z.strictObject({
  action: z.literal("consume"),
  source: z.enum(["print", "order"]),
  sourceId: z.uuid(),
});

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("Accessory stock request failed:", error);
  return NextResponse.json({ error: "Der Zubehörbestand konnte nicht aktualisiert werden." }, { status: 500 });
}

export async function GET(request: Request) {
  const denied = await authorize(request, "settings.read");
  if (denied) return denied;
  try {
    const [settings, movements] = await Promise.all([getSettings(), listAccessoryStockMovements()]);
    return NextResponse.json({
      accessories: settings.accessoryMaterials,
      movements: movements.slice(0, 200),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = z.union([manualSchema, consumeSchema]).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bitte prüfe die Zubehörbuchung." }, { status: 400 });
  }
  const data = parsed.data;
  const denied = await authorize(
    request,
    data.action !== "consume" ? "settings.write" : data.source === "print" ? "prints.write" : "documents.write",
  );
  if (denied) return denied;

  try {
    const settings = await getSettings();
    let movements: AccessoryStockMovement[];
    if (data.action !== "consume") {
      const accessory = settings.accessoryMaterials.find((item) => item.id === data.accessoryId);
      if (!accessory) throw new ApiError(404, "not_found", "Zubehör wurde nicht gefunden.");
      if (data.action === "receipt" && data.quantity < 1) {
        throw new ApiError(400, "validation_error", "Ein Wareneingang muss eine positive Menge haben.");
      }
      movements = [{
        id: randomUUID(),
        accessoryId: accessory.id,
        accessoryName: accessory.name,
        quantity: data.quantity,
        kind: data.action,
        reference: data.action === "receipt" ? "Wareneingang" : "Bestandskorrektur",
        referenceKey: null,
        createdAt: new Date().toISOString(),
      }];
    } else {
      const usage = new Map<string, number>();
      let reference: string;
      if (data.source === "print") {
        const print = await getPrint(data.sourceId);
        if (!print) throw new ApiError(404, "not_found", "Druck nicht gefunden.");
        const inputs = { ...defaultCostInputs(settings), ...(await getPrintCostInputs(print.id)) };
        addAccessoryUsage(usage, inputs.extraCosts, inputs.quantity);
        reference = `Druck ${print.displayName ?? print.fileName}`;
      } else {
        const order = (await listOrders()).find((item) => item.id === data.sourceId);
        if (!order) throw new ApiError(404, "not_found", "Auftrag nicht gefunden.");
        for (const orderItem of order.items) {
          const inputs = { ...defaultCostInputs(settings), ...(await getPrintCostInputs(orderItem.printId)) };
          addAccessoryUsage(usage, inputs.extraCosts, inputs.quantity * orderItem.quantity);
        }
        reference = `Auftrag ${order.customerName}`;
      }
      if (usage.size === 0) throw new ApiError(400, "no_accessories", "Für diese Kalkulation sind keine Zubehörartikel aus dem Lager ausgewählt.");
      const byId = new Map(settings.accessoryMaterials.map((item) => [item.id, item]));
      movements = [...usage].map(([accessoryId, quantity]) => {
        const accessory = byId.get(accessoryId);
        if (!accessory) throw new ApiError(409, "not_found", "Ein verwendeter Zubehörartikel wurde aus der Datenbank entfernt.");
        return {
          id: randomUUID(),
          accessoryId,
          accessoryName: accessory.name,
          quantity: -quantity,
          kind: "consumption" as const,
          reference,
          referenceKey: `consumption:${data.source}:${data.sourceId}:${accessoryId}`,
          createdAt: new Date().toISOString(),
        };
      });
    }

    const result = await applyAccessoryStockMovements(
      movements.map((movement) => accessoryStockMovementSchema.parse(movement)),
    );
    if (result === "duplicate") throw new ApiError(409, "duplicate", "Der Zubehörverbrauch wurde für diese Kalkulation bereits gebucht.");
    if (result === "insufficient") throw new ApiError(409, "insufficient_stock", "Der Zubehörbestand reicht für diese Buchung nicht aus.");
    if (result === "limit") throw new ApiError(400, "stock_limit", "Der Lagerbestand darf eine Milliarde Einheiten nicht überschreiten.");
    if (result === "not_found") throw new ApiError(404, "not_found", "Zubehör wurde nicht gefunden.");
    const [updatedSettings, allMovements] = await Promise.all([getSettings(), listAccessoryStockMovements()]);
    return NextResponse.json({
      accessories: updatedSettings.accessoryMaterials,
      movements: allMovements.slice(0, 200),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

function addAccessoryUsage(usage: Map<string, number>, items: ExtraCostItem[], multiplier: number) {
  for (const item of items) {
    if (!item.accessoryId) continue;
    const quantity = item.quantity * multiplier;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new ApiError(400, "validation_error", "Zubehörmengen müssen positive ganze Zahlen sein.");
    }
    const total = (usage.get(item.accessoryId) ?? 0) + quantity;
    if (!Number.isSafeInteger(total) || total > 1_000_000_000) {
      throw new ApiError(400, "stock_limit", "Der Zubehörverbrauch überschreitet die zulässige Höchstmenge.");
    }
    usage.set(item.accessoryId, total);
  }
}
