import { NextRequest, NextResponse } from "next/server";
import {
  deletePrint,
  getPrint,
  getPrintCostInputs,
  savePrintCostInputs,
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
  await savePrintCostInputs(id, body);
  return NextResponse.json({ ok: true });
}
