import { NextRequest, NextResponse } from "next/server";
import { insertPrint, listPrints } from "@/lib/db";
import { parse3mf } from "@/lib/threemf/parser";

export async function GET() {
  const prints = await listPrints();
  return NextResponse.json({ prints });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Keine Datei hochgeladen." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".3mf")) {
    return NextResponse.json({ error: "Bitte eine .gcode.3mf Datei hochladen." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parse3mf(buffer, file.name);
    const displayName = String(formData.get("displayName") ?? "").trim();
    if (displayName) parsed.displayName = displayName.slice(0, 200);
    await insertPrint(parsed);
    return NextResponse.json({ print: parsed }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler beim Verarbeiten der Datei.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
