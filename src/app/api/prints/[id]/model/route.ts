import { NextResponse } from "next/server";
import { getPrint, getPrintModel, getSettings } from "@/lib/db";
import { getPreviewQueue } from "@/lib/previewQueue";

function modelResponse(model: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(model), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Encoding": "gzip",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const settings = await getSettings();
  if (!settings.general.enable3dPreview) {
    return NextResponse.json({ error: "Die 3D-Vorschau ist in den Einstellungen deaktiviert." }, { status: 403 });
  }
  const { id } = await params;
  const print = await getPrint(id);
  if (!print || print.manual) {
    return NextResponse.json({ error: "3D-Modell nicht gefunden." }, { status: 404 });
  }
  const requestedIndex = new URL(req.url).searchParams.get("plateIndex");
  const plateIndex = requestedIndex === null
    ? print.previewSource?.plateIndex ?? print.plate.plateIndex
    : Number(requestedIndex);
  if (requestedIndex !== null &&
    (typeof plateIndex !== "number" || !Number.isSafeInteger(plateIndex) || plateIndex < 1)) {
    return NextResponse.json({ error: "Ungültige Druckplattennummer." }, { status: 400 });
  }
  if (!print.previewSource && print.plates &&
    !print.plates.some((plate) => plate.plateIndex === plateIndex)) {
    return NextResponse.json({ error: "Druckplatte nicht gefunden." }, { status: 404 });
  }
  const localModel = await getPrintModel(id, plateIndex);
  if (localModel) return modelResponse(localModel);
  const modelPrintId = print.previewSource?.printId ?? id;
  if (print.previewSource && !await getPrint(modelPrintId)) {
    return NextResponse.json({ error: "Quelldruck nicht gefunden." }, { status: 404 });
  }
  const queue = await getPreviewQueue();
  queue.start();
  const status = await queue.status(modelPrintId);
  if (status === "queued" || status === "running") {
    return NextResponse.json({ status }, { status: 202, headers: { "Retry-After": "3", "Cache-Control": "no-store" } });
  }
  if (status === "error") {
    return NextResponse.json({ error: "Die Hintergrundberechnung ist fehlgeschlagen." }, { status: 409 });
  }
  const model = await getPrintModel(modelPrintId, plateIndex);
  if (!model) {
    return NextResponse.json({ error: "Für diesen Druck sind keine 3D-Daten gespeichert." }, { status: 404 });
  }

  return modelResponse(model);
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const settings = await getSettings();
  if (!settings.general.enable3dPreview) {
    return NextResponse.json({ error: "Die 3D-Vorschau ist deaktiviert." }, { status: 403 });
  }
  const { id } = await params;
  const print = await getPrint(id);
  if (!print) return NextResponse.json({ error: "Druck nicht gefunden." }, { status: 404 });
  const modelPrintId = print.previewSource?.printId ?? id;
  const sourcePrint = modelPrintId === id ? print : await getPrint(modelPrintId);
  if (!sourcePrint) return NextResponse.json({ error: "Quelldruck nicht gefunden." }, { status: 404 });
  const queue = await getPreviewQueue();
  if (await queue.status(modelPrintId) !== "error") {
    return NextResponse.json({ error: "Keine fehlgeschlagene Berechnung vorhanden." }, { status: 409 });
  }
  await queue.retry(modelPrintId);
  queue.start();
  return NextResponse.json({ status: "queued" }, { status: 202 });
}