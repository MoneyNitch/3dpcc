import { NextResponse } from "next/server";
import { getPrint, getPrintModel, getSettings } from "@/lib/db";
import { getPreviewQueue } from "@/lib/previewQueue";

export async function GET(
  _req: Request,
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
  const queue = await getPreviewQueue();
  queue.start();
  const status = await queue.status(id);
  if (status === "queued" || status === "running") {
    return NextResponse.json({ status }, { status: 202, headers: { "Retry-After": "3", "Cache-Control": "no-store" } });
  }
  if (status === "error") {
    return NextResponse.json({ error: "Die Hintergrundberechnung ist fehlgeschlagen." }, { status: 409 });
  }
  const model = await getPrintModel(id);
  if (!model) {
    return NextResponse.json({ error: "Für diesen Druck sind keine 3D-Daten gespeichert." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(model), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Encoding": "gzip",
      "Cache-Control": "private, no-store",
    },
  });
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
  if (!await getPrint(id)) return NextResponse.json({ error: "Druck nicht gefunden." }, { status: 404 });
  const queue = await getPreviewQueue();
  if (await queue.status(id) !== "error") {
    return NextResponse.json({ error: "Keine fehlgeschlagene Berechnung vorhanden." }, { status: 409 });
  }
  await queue.retry(id);
  queue.start();
  return NextResponse.json({ status: "queued" }, { status: 202 });
}