import { NextRequest, NextResponse } from "next/server";
import {
  deletePrint,
  getPrint,
  getPrintCostInputs,
  savePrintCostInputs,
  savePrint,
  updatePrintName,
} from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const print = await getPrint(id);
  if (!print) {
    return NextResponse.json({ error: "Druck nicht gefunden." }, { status: 404 });
  }
  const costInputs = await getPrintCostInputs(id);
  return NextResponse.json({ print, costInputs });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deletePrint(id);
  return NextResponse.json({ ok: true });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  if (body.plate && typeof body.plate === "object") {
    const print = await getPrint(id);
    if (!print) return NextResponse.json({ error: "Druck nicht gefunden." }, { status: 404 });
    const plate = body.plate;
    if (
      typeof plate.totalWeightGrams !== "number" ||
      typeof plate.totalPrintTimeSeconds !== "number" ||
      !Array.isArray(plate.filaments) ||
      plate.totalWeightGrams < 0 ||
      plate.totalPrintTimeSeconds < 0 ||
      plate.filaments.some((f: { usedGramsTotal?: unknown }) => typeof f.usedGramsTotal !== "number" || f.usedGramsTotal < 0)
    ) {
      return NextResponse.json({ error: "Ungültige Druckwerte." }, { status: 400 });
    }
    await savePrint({ ...print, plate: { ...print.plate, ...plate } });
    return NextResponse.json({ ok: true });
  }
  await savePrintCostInputs(id, body);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (!displayName || displayName.length > 200) {
    return NextResponse.json({ error: "Bitte einen gültigen Namen eingeben." }, { status: 400 });
  }
  await updatePrintName(id, displayName);
  return NextResponse.json({ ok: true });
}
