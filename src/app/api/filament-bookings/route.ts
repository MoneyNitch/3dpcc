import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/auth/server";
import { createMaterialBooking, listMaterialBookings, saveMaterialBooking } from "@/lib/db";
import { materialBookingActiveKey } from "@/lib/db/shared";
import { ApiError, readJson } from "@/lib/api/http";
import type { MaterialBooking } from "@/lib/types";

export async function GET(request: Request) {
  const denied = await authorize(request, "prints.read");
  if (denied) return denied;
  const printId = new URL(request.url).searchParams.get("printId");
  if (!printId || !z.uuid().safeParse(printId).success) {
    return NextResponse.json({ error: "input" }, { status: 400 });
  }
  const bookings = await listMaterialBookings(printId);
  const staleBefore = Date.now() - 60_000;
  for (let index = 0; index < bookings.length; index++) {
    const booking = bookings[index];
    if (booking.kind === "consumption" && booking.status === "pending" &&
      Date.parse(booking.createdAt) < staleBefore) {
      bookings[index] = { ...booking, status: "uncertain" };
      await saveMaterialBooking(bookings[index], materialBookingActiveKey(bookings[index]));
    }
  }
  return NextResponse.json({ bookings }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

const reversalSchema = z.strictObject({
  relatedBookingId: z.uuid(),
  confirmed: z.literal(true),
});

export async function POST(request: Request) {
  const denied = await authorize(request, "prints.write");
  if (denied) return denied;
  try {
    const parsed = reversalSchema.safeParse(await readJson(request));
    if (!parsed.success) return NextResponse.json({ error: "input" }, { status: 400 });
    const bookings = await listMaterialBookings();
    const original = bookings.find((booking) => booking.id === parsed.data.relatedBookingId);
    if (!original || original.kind !== "consumption" || original.status !== "confirmed") {
      return NextResponse.json({ error: "booking" }, { status: 404 });
    }
    if (bookings.some((booking) =>
      booking.kind === "reversal" && booking.relatedBookingId === original.id)) {
      return NextResponse.json({ error: "duplicate" }, { status: 409 });
    }
    const reversal: MaterialBooking = {
      id: randomUUID(),
      printId: original.printId,
      provider: original.provider,
      sourceUrl: original.sourceUrl,
      spoolId: original.spoolId,
      spoolName: original.spoolName,
      grams: original.grams,
      kind: "reversal",
      status: "confirmed",
      relatedBookingId: original.id,
      note: "Internal journal only; external spool stock was not changed.",
      createdAt: new Date().toISOString(),
    };
    if (!await createMaterialBooking(reversal, materialBookingActiveKey(reversal))) {
      return NextResponse.json({ error: "duplicate" }, { status: 409 });
    }
    return NextResponse.json({ booking: reversal }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: "input" }, { status: error.status });
    }
    console.error("Could not save material booking correction:", error);
    return NextResponse.json({ error: "save" }, { status: 500 });
  }
}
