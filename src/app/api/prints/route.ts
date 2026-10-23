import { NextRequest, NextResponse } from "next/server";
import { deletePrint, getSettings, insertPrint, listPrints } from "@/lib/db";
import { parse3mf } from "@/lib/threemf/parser";
import { getPreviewQueue } from "@/lib/previewQueue";
import type { ParsedPrint } from "@/lib/types";
import { readPrintImage } from "@/lib/printImage";
import { parseManualFilaments, parseManualCategories, manualBreakdown } from "@/lib/manualPrint";

export async function GET() {
  const prints = await listPrints();
  return NextResponse.json({ prints });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  if (formData.get("mode") === "manual") {
    const name = String(formData.get("name") ?? "").trim();
    const minutes = Number(formData.get("minutes"));
    const filaments = parseManualFilaments(formData.get("filaments"));
    const categoryByFilament = filaments && parseManualCategories(formData.get("categoryByFilament"), filaments);
    const image = formData.get("image");
    if (!name || name.length > 200 || !filaments || !categoryByFilament ||
      !Number.isFinite(minutes) || minutes < 0 || !Number.isFinite(minutes * 60)) {
      return NextResponse.json({ error: "Ungültige Druckdaten." }, { status: 400 });
    }
    const breakdown = manualBreakdown(name, filaments, categoryByFilament);
    let thumbnailBase64: string | null;
    try {
      thumbnailBase64 = await readPrintImage(image);
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
    const print: ParsedPrint = {
      id: crypto.randomUUID(),
      fileName: name,
      displayName: name,
      manual: true,
      createdAt: new Date().toISOString(),
      plate: {
        totalWeightGrams: breakdown.totalWeightGrams,
        printTimeSeconds: minutes * 60,
        totalPrintTimeSeconds: minutes * 60,
        layerCount: 0,
        nozzleDiameterMm: null,
        printerModelId: null,
        bedType: null,
        filaments,
        objects: breakdown.objects,
        categoryTotals: breakdown.categoryTotals,
        categoryByFilament: breakdown.categoryByFilament,
        thumbnailBase64,
      },
    };
    await insertPrint(print);
    return NextResponse.json({ print }, { status: 201 });
  }
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Keine Datei hochgeladen." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".3mf")) {
    return NextResponse.json({ error: "Bitte eine unterstützte .3MF-Datei hochladen." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parse3mf(buffer, file.name);
    const displayName = String(formData.get("displayName") ?? "").trim();
    if (displayName) parsed.displayName = displayName.slice(0, 200);
    const settings = await getSettings();
    await insertPrint(parsed);
    try {
      if (settings.general.enable3dPreview) {
        const queue = await getPreviewQueue();
        await queue.enqueue(parsed.id, buffer);
        queue.start();
      }
    } catch (error) {
      await (await getPreviewQueue()).cancel(parsed.id);
      await deletePrint(parsed.id);
      throw error;
    }
    return NextResponse.json({ print: parsed }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler beim Verarbeiten der Datei.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
