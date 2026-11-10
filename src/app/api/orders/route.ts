import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/http";
import { getSettings, listCustomers, listOrders, listPrints, saveOrder } from "@/lib/db";
import { orderCustomer } from "@/lib/customers";
import { orderInputSchema, readOrderBody } from "@/lib/orders";
import type { PrintOrder } from "@/lib/types";
import { authorize } from "@/lib/auth/server";

export async function GET(request: Request) {
  const denied = await authorize(request, "documents.read");
  if (denied) return denied;
  return NextResponse.json({ orders: await listOrders() }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  const denied = await authorize(request, "documents.write");
  if (denied) return denied;
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
  const [printRecords, settings] = await Promise.all([listPrints(), getSettings()]);
  const prints = new Set(printRecords.map((print) => print.id));
  if (parsed.data.items.some((item) => !prints.has(item.printId))) {
    return NextResponse.json({ error: "Mindestens ein zugeordneter Druck wurde nicht gefunden." }, { status: 400 });
  }
  if (parsed.data.printerId && !settings.printers.some((printer) => printer.id === parsed.data.printerId)) {
    return NextResponse.json({ error: "Der ausgewählte Drucker wurde nicht gefunden." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const customer = parsed.data.customerId
    ? (await listCustomers()).find((customer) => customer.id === parsed.data.customerId && !customer.archived)
    : undefined;
  if (parsed.data.customerId && !customer) {
    return NextResponse.json({ error: "customers.error.notFound" }, { status: 400 });
  }
  const order: PrintOrder = {
    id: randomUUID(),
    ...parsed.data,
    ...(customer ? orderCustomer(customer) : { customerId: null }),
    queuePosition: undefined,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await saveOrder(order);
  return NextResponse.json({ order: saved }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
