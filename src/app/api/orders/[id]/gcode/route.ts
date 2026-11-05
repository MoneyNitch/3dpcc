import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, readBody } from "@/lib/api/http";
import { listOrders, saveOrder } from "@/lib/db";
import { authorize } from "@/lib/auth/server";
import {
  maximumOrderGcodeBytes,
  normalizeOrderGcodeFileName,
  orderGcodeFiles,
} from "@/lib/orderGcode";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const denied = await authorize(request, "documents.write");
  if (denied) return denied;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
  }
  const order = (await listOrders()).find((item) => item.id === id);
  if (!order) return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });

  if (!/^application\/octet-stream(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return NextResponse.json({ error: "Bitte lade eine G-Code-Datei hoch." }, { status: 415 });
  }
  let fileName: string;
  try {
    const encodedName = request.headers.get("x-file-name");
    if (!encodedName) throw new ApiError(400, "validation_error", "Der Dateiname fehlt.");
    let decodedName: string;
    try {
      decodedName = decodeURIComponent(encodedName);
    } catch {
      throw new ApiError(400, "validation_error", "Der Dateiname ist ungültig.");
    }
    fileName = normalizeOrderGcodeFileName(decodedName);
    const bytes = await readBody(request, maximumOrderGcodeBytes);
    if (bytes.byteLength === 0) {
      throw new ApiError(400, "validation_error", "Die G-Code-Datei ist leer.");
    }
    await orderGcodeFiles.save(id, bytes);
    const updated = {
      ...order,
      gcodeAttachment: { fileName, size: bytes.byteLength },
      updatedAt: new Date().toISOString(),
    };
    await saveOrder(updated);
    return NextResponse.json({ order: updated }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  const denied = await authorize(request, "documents.read");
  if (denied) return denied;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
  }
  const order = (await listOrders()).find((item) => item.id === id);
  if (!order) return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
  if (!order.gcodeAttachment) {
    return NextResponse.json({ error: "Für diesen Auftrag ist keine G-Code-Datei hinterlegt." }, { status: 404 });
  }
  const file = await orderGcodeFiles.read(id);
  if (!file) return NextResponse.json({ error: "Die G-Code-Datei wurde nicht gefunden." }, { status: 404 });
  const fileName = normalizeOrderGcodeFileName(order.gcodeAttachment.fileName);
  const encodedName = encodeURIComponent(fileName).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(new Uint8Array(file), { headers: {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="order.gcode"; filename*=UTF-8''${encodedName}`,
    "Content-Length": String(file.byteLength),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const denied = await authorize(request, "documents.write");
  if (denied) return denied;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
  }
  const order = (await listOrders()).find((item) => item.id === id);
  if (!order) return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
  if (!order.gcodeAttachment) {
    return NextResponse.json({ error: "Für diesen Auftrag ist keine G-Code-Datei hinterlegt." }, { status: 404 });
  }
  const updatedOrder = { ...order };
  delete updatedOrder.gcodeAttachment;
  const updated = { ...updatedOrder, updatedAt: new Date().toISOString() };
  await saveOrder(updated);
  await orderGcodeFiles.remove(id);
  return NextResponse.json({ order: updated }, { headers: { "Cache-Control": "private, no-store" } });
}
