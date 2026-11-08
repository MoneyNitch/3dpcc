import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api/http";
import { deleteOrder, getSettings, listCustomers, listPrints, listOrders, saveOrder } from "@/lib/db";
import { orderCustomer } from "@/lib/customers";
import { authorize } from "@/lib/auth/server";
import { orderInputSchema, orderQuickUpdateSchema, readOrderBody } from "@/lib/orders";
import { orderGcodeFiles } from "@/lib/orderGcode";
import type { PrintOrder } from "@/lib/types";

export async function PATCH(
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
  const parsed = orderQuickUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bitte wähle einen gültigen Status oder eine gültige Priorität." }, { status: 400 });
  }
  const order = (await listOrders()).find((item) => item.id === id);
  if (!order) return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
  const { expectedUpdatedAt, ...patch } = parsed.data;
  if (expectedUpdatedAt && expectedUpdatedAt !== order.updatedAt) {
    return NextResponse.json({ error: "orders.workflow.conflict" }, { status: 409 });
  }
  const updated: PrintOrder = {
    ...order,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const saved = expectedUpdatedAt ? await saveOrder(updated, expectedUpdatedAt) : await saveOrder(updated);
  if (!saved) return NextResponse.json({ error: "orders.workflow.conflict" }, { status: 409 });
  return NextResponse.json({ order: saved }, { headers: { "Cache-Control": "private, no-store" } });
}

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
  const [existing, prints, settings] = await Promise.all([listOrders(), listPrints(), getSettings()]);
  const order = existing.find((item) => item.id === id);
  if (!order) return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
  const printIds = new Set(prints.map((print) => print.id));
  if (parsed.data.items.some((item) => !printIds.has(item.printId))) {
    return NextResponse.json({ error: "Mindestens ein zugeordneter Druck wurde nicht gefunden." }, { status: 400 });
  }
  if (parsed.data.printerId && !settings.printers.some((printer) => printer.id === parsed.data.printerId)) {
    return NextResponse.json({ error: "Der ausgewählte Drucker wurde nicht gefunden." }, { status: 400 });
  }
  const customerId = parsed.data.customerId === undefined ? order.customerId : parsed.data.customerId;
  const customer = customerId ? (await listCustomers()).find((entry) =>
    entry.id === customerId && (!entry.archived || order.customerId === customerId)) : undefined;
  if (customerId && !customer) {
    return NextResponse.json({ error: "customers.error.notFound" }, { status: 400 });
  }
  const updated: PrintOrder = {
    ...order,
    ...parsed.data,
    ...orderCustomer(customer, order),
    customerName: customer ? orderCustomer(customer, order).customerName : parsed.data.customerName,
    queuePosition: parsed.data.printerId === (order.printerId ?? null) ? order.queuePosition : undefined,
    updatedAt: new Date().toISOString(),
  };
  const saved = await saveOrder(updated);
  return NextResponse.json({ order: saved }, { headers: { "Cache-Control": "private, no-store" } });
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
  await orderGcodeFiles.remove(id);
  await deleteOrder(id);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
