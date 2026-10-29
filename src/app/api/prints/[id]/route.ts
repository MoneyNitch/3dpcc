import { NextRequest, NextResponse } from "next/server";
import {
  deletePrint,
  getPrint,
  getPrintCostInputs,
  savePrintCostInputs,
  savePrint,
  updatePrintName,
} from "@/lib/db";
import { readPrintImage } from "@/lib/printImage";
import { manualBreakdown, parseManualCategories, parseManualFilaments } from "@/lib/manualPrint";
import { getPreviewQueue } from "@/lib/previewQueue";
import { z } from "zod";
import { externalSpoolSchema } from "@/lib/externalFilaments";

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
  await (await getPreviewQueue()).cancel(id);
  await deletePrint(id);
  return NextResponse.json({ ok: true });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const isForm = req.headers.get("content-type")?.includes("multipart/form-data");
  const form = isForm ? await req.formData() : null;
  let body;
  try {
    body = form ? { plate: JSON.parse(String(form.get("plate") ?? "{}")) } : await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Druckdaten." }, { status: 400 });
  }
  if (body.plate && typeof body.plate === "object") {
    const print = await getPrint(id);
    if (!print) return NextResponse.json({ error: "Druck nicht gefunden." }, { status: 404 });
    const plate = body.plate;
    if (
      typeof plate.totalWeightGrams !== "number" ||
      typeof plate.totalPrintTimeSeconds !== "number" ||
      !Array.isArray(plate.filaments) ||
      !Number.isFinite(plate.totalWeightGrams) || !Number.isFinite(plate.totalPrintTimeSeconds) ||
      plate.totalWeightGrams < 0 || plate.totalPrintTimeSeconds < 0 ||
      (!print.manual && plate.filaments.length !== print.plate.filaments.length) ||
      plate.filaments.some((f: { usedGramsTotal?: unknown }) => typeof f.usedGramsTotal !== "number" || !Number.isFinite(f.usedGramsTotal) || f.usedGramsTotal < 0)
    ) {
      return NextResponse.json({ error: "Ungültige Druckwerte." }, { status: 400 });
    }
    let manualFilaments = null;
    let manualCategories = null;
    if (print.manual) {
      manualFilaments = parseManualFilaments(JSON.stringify(plate.filaments));
      manualCategories = manualFilaments && parseManualCategories(plate.categoryByFilament == null ? null : JSON.stringify(plate.categoryByFilament), manualFilaments);
      if (!manualFilaments || !manualCategories || plate.totalWeightGrams !== manualFilaments.reduce((sum, item) => sum + item.usedGramsTotal, 0)) {
        return NextResponse.json({ error: "Ungültige Materialdaten." }, { status: 400 });
      }
    }
    let thumbnailBase64 = print.plate.thumbnailBase64;
    if (form?.get("removeImage") === "true") thumbnailBase64 = null;
    else if (form?.get("image") instanceof File) {
      try {
        thumbnailBase64 = await readPrintImage(form.get("image"));
      } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 400 });
      }
    }
    const breakdown = manualFilaments && manualCategories ? manualBreakdown(print.displayName ?? print.fileName, manualFilaments, manualCategories) : {};
    await savePrint({ ...print, plate: { ...print.plate, ...plate,
      ...(manualFilaments ? { filaments: manualFilaments } : {}), ...breakdown, thumbnailBase64 } });
    return NextResponse.json({ ok: true });
  }
  if (body.externalSpools !== undefined &&
    !z.record(z.string(), externalSpoolSchema).safeParse(body.externalSpools).success) {
    return NextResponse.json({ error: "Ungültige externe Spulenauswahl." }, { status: 400 });
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
  const print = await getPrint(id);
  if (!print) return NextResponse.json({ error: "Druck nicht gefunden." }, { status: 404 });
  if (print.manual) {
    await savePrint({ ...print, displayName, plate: { ...print.plate,
      objects: print.plate.objects.map((object) => ({ ...object, name: displayName })) } });
  } else {
    await updatePrintName(id, displayName);
  }
  return NextResponse.json({ ok: true });
}
