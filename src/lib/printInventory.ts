import { spoolConsumptionForFilaments } from "./externalFilaments";
import type { AccessoryMaterial, MaterialBooking, ParsedPlate, PrintCostInputs } from "./types";

export type InventoryResult = {
  name: string;
  status: "booked" | "skipped" | "error";
  code?: string;
  accessory?: boolean;
};

export type InventoryTarget = {
  name: string;
  url: string;
  body: Record<string, unknown>;
  existing?: InventoryResult;
};

export function printInventoryTargets(
  printId: string,
  plates: ParsedPlate[],
  inputs: PrintCostInputs,
  bookings: MaterialBooking[],
): InventoryTarget[] {
  const spools = spoolConsumptionForFilaments(
    plates.flatMap((plate) => plate.filaments), inputs.externalSpools ?? {}, inputs.quantity,
  );
  const targets: InventoryTarget[] = [];
  for (const { spool, grams } of spools.values()) {
    if (grams <= 0) continue;
    const booking = bookings.find((entry) =>
      entry.kind === "consumption" && entry.provider === spool.provider &&
      entry.sourceUrl === spool.sourceUrl && entry.spoolId === spool.id &&
      ["pending", "confirmed", "uncertain"].includes(entry.status));
    targets.push({
      name: spool.name,
      url: "/api/filament-spools",
      body: { printId, provider: spool.provider, sourceUrl: spool.sourceUrl, id: spool.id, grams, confirmed: true },
      existing: booking ? {
        name: spool.name,
        status: booking.status === "confirmed" ? "skipped" : "error",
        code: booking.status === "confirmed" ? "duplicate" : "uncertain",
      } : undefined,
    });
  }
  if ((inputs.extraCosts ?? []).some((item) => item.accessoryId)) {
    targets.push({
      name: "accessories",
      url: "/api/accessory-stock",
      body: { action: "consume", source: "print", sourceId: printId },
    });
  }
  return targets;
}

export async function bookPrintInventory(
  targets: InventoryTarget[],
  request: typeof fetch = fetch,
): Promise<{ results: InventoryResult[]; accessories?: AccessoryMaterial[] }> {
  const results: InventoryResult[] = [];
  let accessories: AccessoryMaterial[] | undefined;
  for (const target of targets) {
    if (target.existing) {
      results.push(target.existing);
      continue;
    }
    const item = { name: target.name, accessory: target.url === "/api/accessory-stock" };
    try {
      const response = await request(target.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target.body),
      });
      const body: { error?: string; code?: string; booking?: MaterialBooking; accessories?: AccessoryMaterial[] } =
        await response.json();
      const code = body.code ?? body.error;
      if (response.status === 409 && code === "duplicate" && target.url === "/api/accessory-stock") {
        results.push({ ...item, status: "skipped", code });
      } else if (response.status === 409 && code === "duplicate") {
        results.push({ ...item, status: "error", code: "uncertain" });
      } else if (!response.ok || (target.url === "/api/filament-spools"
        ? body.booking?.status !== "confirmed"
        : !Array.isArray(body.accessories))) {
        results.push({ ...item, status: "error", code: code ?? "uncertain" });
      } else {
        results.push({ ...item, status: "booked" });
        if (body.accessories) accessories = body.accessories;
      }
    } catch (error) {
      console.error("Print inventory booking failed:", target.name, error);
      results.push({ ...item, status: "error", code: "uncertain" });
    }
  }
  return { results, accessories };
}
