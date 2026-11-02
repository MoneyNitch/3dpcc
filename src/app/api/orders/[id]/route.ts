import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api/http";
import { deleteOrder, listPrints, listOrders, saveOrder } from "@/lib/db";
import { authorize } from "@/lib/auth/server";
import { orderInputSchema, readOrderBody } from "@/lib/orders";
import type { PrintOrder } from "@/lib/types";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await authorize(request, "documents.write");
  if (denied) return denied;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });

  let body: unknown;
  try {
    body = await readOrderBody(request);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  const parsed = orderInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bitte prüfe Kunde, Status und Druckpositionen." }, { status: 400 });
  }
  const [existing, prints] = await Promise.all([listOrders(), listPrints()]);
  const order = existing.find((item) => item.id === id);
  if (!order) return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
  const printIds = new Set(prints.map((print) => print.id));
  if (parsed.data.items.some((item) => !printIds.has(item.printId))) {
    return NextResponse.json({ error: "Mindestens ein zugeordneter Druck wurde nicht gefunden." }, { status: 400 });
  }
  const updated: PrintOrder = {
    ...order,
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  };
  await saveOrder(updated);
  return NextResponse.json({ order: updated }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await authorize(request, "documents.write");
  if (denied) return denied;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
  const exists = (await listOrders()).some((order) => order.id === id);
  if (!exists) return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
  await deleteOrder(id);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
