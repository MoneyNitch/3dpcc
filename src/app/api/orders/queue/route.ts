import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/auth/server";
import { getSettings, listOrders, saveOrderQueue } from "@/lib/db";
import { ApiError, readJson } from "@/lib/api/http";

const queueSchema = z.strictObject({
  printerId: z.string().trim().min(1).max(128),
  orderIds: z.array(z.uuid()).min(1).max(10_000),
});

export async function PUT(request: Request) {
  const denied = await authorize(request, "documents.write");
  if (denied) return denied;
  try {
    const parsed = queueSchema.safeParse(await readJson(request));
    if (!parsed.success || new Set(parsed.data?.orderIds ?? []).size !== parsed.data?.orderIds.length) {
      return NextResponse.json({ error: "Bitte prüfe die Druckerwarteschlange." }, { status: 400 });
    }
    const [orders, settings] = await Promise.all([listOrders(), getSettings()]);
    if (!settings.printers.some((printer) => printer.id === parsed.data.printerId)) {
      return NextResponse.json({ error: "Der ausgewählte Drucker wurde nicht gefunden." }, { status: 404 });
    }
    const activeOrders = orders.filter((order) =>
      order.printerId === parsed.data.printerId && order.status !== "completed" && order.status !== "cancelled");
    if (activeOrders.length !== parsed.data.orderIds.length ||
      activeOrders.some((order) => !parsed.data.orderIds.includes(order.id))) {
      return NextResponse.json({ error: "Die Warteschlange wurde inzwischen geändert. Bitte neu laden." }, { status: 409 });
    }
    const positions = new Map(parsed.data.orderIds.map((id, index) => [id, index]));
    await saveOrderQueue(activeOrders.map((order) => ({
      ...order,
      queuePosition: positions.get(order.id)!,
    })));
    return NextResponse.json({ orders: await listOrders() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Could not save printer queue:", error);
    return NextResponse.json({ error: "Die Druckerwarteschlange konnte nicht gespeichert werden." }, { status: 500 });
  }
}
