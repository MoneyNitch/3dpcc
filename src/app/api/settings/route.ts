import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/db";
import { migrateSettings } from "@/lib/db/shared";
import { getPreviewQueue } from "@/lib/previewQueue";
import { isCurrencyCode } from "@/lib/currency";

export async function GET() {
  return NextResponse.json({ settings: await getSettings() });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  if (body?.general?.currency !== undefined && !isCurrencyCode(body.general.currency)) {
    return NextResponse.json({ error: "Bitte wähle eine unterstützte Währung aus." }, { status: 400 });
  }
  if (body?.general?.enable3dPreview !== undefined && typeof body.general.enable3dPreview !== "boolean") {
    return NextResponse.json({ error: "Die 3D-Vorschau muss aktiviert oder deaktiviert sein." }, { status: 400 });
  }
  const duty = body?.general?.previewComputePercent;
  if (duty !== undefined && (typeof duty !== "number" || !Number.isInteger(duty) || duty < 10 || duty > 100)) {
    return NextResponse.json({ error: "Die Hintergrund-Rechenleistung muss zwischen 10 und 100 liegen." }, { status: 400 });
  }
  await saveSettings(migrateSettings(body));
  (await getPreviewQueue()).start();
  return NextResponse.json({ ok: true });
}
