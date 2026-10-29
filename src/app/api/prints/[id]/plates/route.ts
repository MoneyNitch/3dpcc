import { NextResponse } from "next/server";
import {
  deletePrint,
  getPrint,
  getPrintCostInputs,
  getPrintModel,
  insertPrint,
  listPrints,
  savePrintModel,
  savePrintCostInputs,
} from "@/lib/db";
import type { ParsedPrint } from "@/lib/types";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const source = await getPrint(id);
  if (!source) return NextResponse.json({ error: "Druck nicht gefunden." }, { status: 404 });
  if (!source.plates || source.plates.length < 2) {
    return NextResponse.json({ error: "Dieser Druck enthält keine mehreren Druckplatten." }, { status: 400 });
  }
  if (source.plates.some((plate) =>
    plate.plateIndex === undefined || !Number.isSafeInteger(plate.plateIndex) || plate.plateIndex < 1
  )) {
    return NextResponse.json({ error: "Die Druckplatten enthalten ungültige Nummern." }, { status: 422 });
  }

  const existing = (await listPrints()).filter((print) => print.previewSource?.printId === id);
  const existingIndices = new Set(existing.map((print) => print.previewSource?.plateIndex));
  const plates = source.plates.filter((plate) => !existingIndices.has(plate.plateIndex));
  if (plates.length === 0) return NextResponse.json({ count: 0 });

  const initialInputs = await getPrintCostInputs(id);
  const created: string[] = [];
  try {
    for (const plate of plates) {
      const plateNumber = plate.plateIndex;
      if (plateNumber === undefined) throw new Error("Missing plate index after validation.");
      const name = `${source.displayName ?? source.fileName} — ${plate.plateName ?? `Platte ${plateNumber}`}`;
      const print: ParsedPrint = {
        id: crypto.randomUUID(),
        fileName: source.fileName,
        displayName: name.slice(0, 200),
        createdAt: new Date().toISOString(),
        plate,
        previewSource: { printId: id, plateIndex: plateNumber },
      };
      await insertPrint(print);
      created.push(print.id);
      const sourceModel = await getPrintModel(id, plateNumber);
      if (sourceModel) await savePrintModel(print.id, sourceModel, plateNumber);
      if (initialInputs) await savePrintCostInputs(print.id, initialInputs);
    }
  } catch (error) {
    console.error(`Failed to create individual plate prints for ${id}:`, error);
    for (const printId of created) {
      try {
        await deletePrint(printId);
      } catch (cleanupError) {
        console.error(`Failed to remove incomplete plate print ${printId}:`, cleanupError);
      }
    }
    return NextResponse.json({ error: "Die einzelnen Druckplatten konnten nicht vollständig angelegt werden." }, { status: 500 });
  }

  return NextResponse.json({ count: created.length }, { status: 201 });
}
