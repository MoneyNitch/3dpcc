import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getFilamentConnections } from "@/lib/filamentConfig";
import { consumeExternalSpool, fetchExternalSpools, FILAMENT_PROVIDERS, FilamentServiceError, type ExternalSpoolResult } from "@/lib/externalFilaments";
import { createMaterialBooking, saveMaterialBooking } from "@/lib/db";
import { materialBookingActiveKey } from "@/lib/db/shared";
import { authorize } from "@/lib/auth/server";
import { z } from "zod";
import { ApiError, readJson } from "@/lib/api/http";
import type { MaterialBooking } from "@/lib/types";

export async function GET(request: Request) {
  const denied = await authorize(request, "prints.read");
  if (denied) return denied;
  try {
    const connections = getFilamentConnections();
    const results = await Promise.all(FILAMENT_PROVIDERS.filter((provider) => connections[provider].url)
      .map(async (provider): Promise<ExternalSpoolResult> => {
        try {
          return { provider, spools: await fetchExternalSpools(provider, connections[provider]) };
        } catch (error) {
          if (!(error instanceof FilamentServiceError)) throw error;
          console.error(`Could not load filament spools (${provider}): ${error.code}`);
          return { provider, spools: [], error: error.code };
        }

      }));
    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Could not read filament connection configuration.");
    return NextResponse.json({ error: "config" }, { status: 500 });
  }
}

const consumptionSchema = z.strictObject({
  printId: z.uuid(),
  provider: z.enum(FILAMENT_PROVIDERS),
  sourceUrl: z.string().min(1),
  id: z.number().int().positive(),
  grams: z.number().finite().positive(),
  confirmed: z.literal(true),
});

export async function POST(request: Request) {
  const denied = await authorize(request, "prints.write");
  if (denied) return denied;
  let booking: MaterialBooking | undefined;
  let bookingCreated = false;
  let mutationStarted = false;
  try {
    const parsed = consumptionSchema.safeParse(await readJson(request));
    if (!parsed.success) return NextResponse.json({ error: "input" }, { status: 400 });
    const { printId, provider, sourceUrl, id, grams } = parsed.data;
    const connection = getFilamentConnections()[provider];
    if (!connection.url || connection.url !== sourceUrl) {
      return NextResponse.json({ error: "source" }, { status: 409 });
    }
    const spool = (await fetchExternalSpools(provider, connection)).find((item) => item.id === id);
    if (!spool) return NextResponse.json({ error: "missing" }, { status: 404 });
    if (spool.remainingGrams === null || spool.remainingGrams < grams) {
      return NextResponse.json({ error: "stock" }, { status: 409 });
    }
    booking = {
      id: randomUUID(),
      printId,
      provider,
      sourceUrl,
      spoolId: id,
      spoolName: spool.name,
      grams,
      kind: "consumption",
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    if (!await createMaterialBooking(booking, materialBookingActiveKey(booking))) {
      return NextResponse.json({ error: "duplicate" }, { status: 409 });
    }
    bookingCreated = true;
    mutationStarted = true;
    await consumeExternalSpool(provider, connection, id, grams);
    booking = { ...booking, status: "confirmed" };
    await saveMaterialBooking(booking, materialBookingActiveKey(booking));
    return NextResponse.json({ booking }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("External spool consumption failed:", error instanceof FilamentServiceError ? error.code : error);
    if (bookingCreated && booking) {
      const status = !mutationStarted || (error instanceof FilamentServiceError && error.code === "auth")
        ? "rejected"
        : "uncertain";
      booking = { ...booking, status };
      await saveMaterialBooking(booking, materialBookingActiveKey(booking));
    }
    if (error instanceof ApiError) {
      return NextResponse.json({ error: "input" }, { status: error.status });
    }
    if (error instanceof FilamentServiceError && error.code === "auth") {
      return NextResponse.json({ error: "auth" }, { status: 403 });
    }
    return NextResponse.json({
      error: bookingCreated && booking?.status === "uncertain" ? "uncertain" : "connection",
    }, { status: 502 });
  }
}
