import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import { randomUUID } from "node:crypto";
import { analyzeGcode, parseBucketKey } from "./gcodeAnalyzer";
import { gcodeGeometrySteps } from "./gcodeGeometry";
import type {
  CategoryBreakdown,
  FilamentUsage,
  MaterialCategoryBreakdown,
  ModelGeometry,
  ObjectBreakdown,
  ParsedPlate,
  ParsedPrint,
  PartCategory,
} from "../types";

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function findEntry(zip: AdmZip, matcher: (name: string) => boolean) {
  return zip.getEntries().find((e) => matcher(e.entryName));
}

function parseTimeToSeconds(text: string): number {
  // e.g. "2h 52m 41s"
  let total = 0;
  const hourMatch = /(\d+)h/.exec(text);
  const minMatch = /(\d+)m/.exec(text);
  const secMatch = /(\d+)s/.exec(text);
  if (hourMatch) total += parseInt(hourMatch[1], 10) * 3600;
  if (minMatch) total += parseInt(minMatch[1], 10) * 60;
  if (secMatch) total += parseInt(secMatch[1], 10);
  return total;
}

interface GcodeHeader {
  modelPrintTimeSeconds: number;
  totalEstimatedTimeSeconds: number;
  layerCount: number;
  filamentWeights: number[]; // grams, per filament slot in header order
  filamentLengths: number[]; // mm, per filament slot
  filamentSlotToId: number[]; // "; filament: 2,5" -> slot index -> filament id
  modelLabelIds: string[]; // "; model label id: 114,125"
  objectMaxHeights: number[]; // "; object max height: 9.48,22.92"
}

function parseGcodeHeader(gcode: string): GcodeHeader {
  const headerEndIdx = gcode.indexOf("HEADER_BLOCK_END");
  const header = headerEndIdx >= 0 ? gcode.slice(0, headerEndIdx) : gcode.slice(0, 4000);

  const timeLine = /model printing time:\s*([^;]+);\s*total estimated time:\s*([^\r\n]+)/.exec(
    header
  );
  const layerLine = /total layer number:\s*(\d+)/.exec(header);
  const weightLine = /total filament weight \[g\]\s*:\s*([^\r\n]+)/.exec(header);
  const lengthLine = /total filament length \[mm\]\s*:\s*([^\r\n]+)/.exec(header);
  const filamentSlotLine = /^\s*;\s*filament:\s*([^\r\n]+)/m.exec(header);
  const modelLabelLine = /model label id:\s*([^\r\n]+)/.exec(header);
  const maxHeightLine = /object max height:\s*([^\r\n]+)/.exec(header);

  return {
    modelPrintTimeSeconds: timeLine ? parseTimeToSeconds(timeLine[1]) : 0,
    totalEstimatedTimeSeconds: timeLine ? parseTimeToSeconds(timeLine[2]) : 0,
    layerCount: layerLine ? parseInt(layerLine[1], 10) : 0,
    filamentWeights: weightLine ? weightLine[1].split(",").map((v) => parseFloat(v.trim())) : [],
    filamentLengths: lengthLine ? lengthLine[1].split(",").map((v) => parseFloat(v.trim())) : [],
    filamentSlotToId: filamentSlotLine
      ? filamentSlotLine[1].split(",").map((v) => parseInt(v.trim(), 10))
      : [],
    modelLabelIds: modelLabelLine ? modelLabelLine[1].split(",").map((v) => v.trim()) : [],
    objectMaxHeights: maxHeightLine
      ? maxHeightLine[1].split(",").map((v) => parseFloat(v.trim()))
      : [],
  };
}

interface RawFilament extends FilamentUsage {
  trayInfoIdx: string;
}

interface SliceInfo {
  plateWeight: number | null;
  predictionSeconds: number | null;
  printerModelId: string | null;
  objects: { identifyId: string; name: string }[];
  filaments: RawFilament[];
}

function toFilamentUsage(filament: RawFilament): FilamentUsage {
  return {
    filamentId: filament.filamentId,
    type: filament.type,
    color: filament.color,
    usedGramsTotal: filament.usedGramsTotal,
    usedMetersTotal: filament.usedMetersTotal,
    usedForObject: filament.usedForObject,
    usedForSupport: filament.usedForSupport,
  };
}

/** "; filament_ids = GFA00;GFB00;..." -> tray_info_idx per physical T-slot (0-based). */
function parseTraySlotMap(gcode: string): string[] {
  const match = /^\s*;\s*filament_ids\s*=\s*([^\r\n]+)/m.exec(gcode);
  return match ? match[1].split(";").map((v) => v.trim()) : [];
}

function parseSliceInfoConfig(xml: string): SliceInfo {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const doc = parser.parse(xml);
  const plate = doc?.config?.plate ?? {};
  const metadataArr = toArray<{ key: string; value: string }>(plate.metadata);
  const metadata: Record<string, string> = {};
  for (const m of metadataArr) metadata[m.key] = m.value;

  const objects = toArray<{ identify_id: string; name: string }>(plate.object).map((o) => ({
    identifyId: String(o.identify_id),
    name: o.name,
  }));

  const filaments = toArray<{
    id: string;
    type: string;
    color: string;
    used_m: string;
    used_g: string;
    used_for_object?: string;
    used_for_support?: string;
    tray_info_idx?: string;
  }>(plate.filament).map((f) => ({
    filamentId: String(f.id),
    type: f.type,
    color: f.color,
    usedGramsTotal: parseFloat(f.used_g ?? "0"),
    usedMetersTotal: parseFloat(f.used_m ?? "0"),
    usedForObject: f.used_for_object === "true",
    usedForSupport: f.used_for_support === "true",
    trayInfoIdx: f.tray_info_idx ?? "",
  }));

  return {
    plateWeight: metadata.weight ? parseFloat(metadata.weight) : null,
    predictionSeconds: metadata.prediction ? parseInt(metadata.prediction, 10) : null,
    printerModelId: metadata.printer_model_id ?? null,
    objects,
    filaments,
  };
}

const CATEGORY_ORDER: PartCategory[] = ["model", "support", "tower", "other"];

type ModelVertex = { x: string; y: string; z: string };
type ModelTriangle = { v1: string; v2: string; v3: string; pid?: string; p1?: string };
type ModelObject = {
  id: string;
  pid?: string;
  pindex?: string;
  displaycolor?: string;
  mesh?: { vertices?: { vertex: ModelVertex | ModelVertex[] }; triangles?: { triangle: ModelTriangle | ModelTriangle[] } };
  components?: { component: { objectid: string; transform?: string } | { objectid: string; transform?: string }[] };
};

const IDENTITY_TRANSFORM = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

function parseTransform(value?: string): number[] {
  if (!value) return IDENTITY_TRANSFORM;
  const numbers = value.split(/\s+/).map(Number);
  return numbers.length === 12 && numbers.every(Number.isFinite) ? numbers : IDENTITY_TRANSFORM;
}

function transformPoint(point: [number, number, number], transforms: number[][]): [number, number, number] {
  let [x, y, z] = point;
  for (const transform of transforms) {
    [x, y, z] = [
      x * transform[0] + y * transform[3] + z * transform[6] + transform[9],
      x * transform[1] + y * transform[4] + z * transform[7] + transform[10],
      x * transform[2] + y * transform[5] + z * transform[8] + transform[11],
    ];
  }
  return [x, y, z];
}

/** Extracts build meshes from a 3MF archive for the optional interactive preview. */
export function parse3mfGeometry(buffer: Buffer): ModelGeometry | null {
  const steps = geometrySteps(buffer);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

export function* geometrySteps(buffer: Buffer): Generator<void, ModelGeometry | null> {
  const zip = new AdmZip(buffer);
  function* toolpathFallback(): Generator<void, ModelGeometry | null> {
    const entry = findEntry(zip, (name) => /plate_\d+\.gcode$/.test(name));
    return entry ? yield* gcodeGeometrySteps(entry.getData().toString("utf-8")) : null;
  }
  const toolpathGeometry = yield* toolpathFallback();
  if (toolpathGeometry) return toolpathGeometry;

  const modelEntry = findEntry(zip, (name) => /^3d\/3dmodel\.model$/i.test(name));
  if (!modelEntry) return null;

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const model = parser.parse(modelEntry.getData().toString("utf-8"))?.model;
  const resourceData = model?.resources ?? {};
  const objects = toArray<ModelObject>(resourceData.object);
  const objectsById = new Map(objects.map((object) => [object.id, object]));
  const materials = new Map<string, string>();
  for (const group of toArray<{ id: string; base: { displaycolor: string } | { displaycolor: string }[] }>(resourceData.basematerials)) {
    toArray(group.base).forEach((material, index) => materials.set(`${group.id}:${index}`, material.displaycolor));
  }

  const buildItems = toArray<{ objectid: string; transform?: string }>(model?.build?.item);
  const roots: { objectid: string; transform?: string }[] =
    buildItems.length ? buildItems : objects.map((object) => ({ objectid: object.id }));
  const geometry: ModelGeometry = { positions: [], colors: [] };
  const maxTriangles = 50_000;
  let limitReached = false;

  function appendObject(objectId: string, transforms: number[][], stack: Set<string>, depth: number): void {
    if (depth > 32 || stack.has(objectId)) return;
    const object = objectsById.get(objectId);
    if (!object) return;
    const nextStack = new Set(stack).add(objectId);
    const mesh = object.mesh;
    if (mesh) {
      const vertices = toArray(mesh.vertices?.vertex).map((vertex) => [Number(vertex.x), Number(vertex.y), Number(vertex.z)] as [number, number, number]);
      const objectColor = object.displaycolor ?? materials.get(`${object.pid}:${object.pindex ?? "0"}`) ?? "#94a3b8";
      for (const triangle of toArray(mesh.triangles?.triangle)) {
        if (geometry.colors.length >= maxTriangles) {
          limitReached = true;
          break;
        }
        const indices = [Number(triangle.v1), Number(triangle.v2), Number(triangle.v3)];
        if (indices.some((index) => !Number.isInteger(index) || index < 0 || index >= vertices.length)) continue;
        const trianglePoints = indices.map((index) => vertices[index]);
        if (trianglePoints.some((point) => !point.every(Number.isFinite))) continue;
        const triangleColor = triangle.pid && triangle.p1
          ? materials.get(`${triangle.pid}:${triangle.p1}`) ?? objectColor
          : objectColor;
        for (const point of trianglePoints) geometry.positions.push(...transformPoint(point, transforms));
        geometry.colors.push(triangleColor);
      }
    }
    for (const component of toArray(object.components?.component)) {
      appendObject(component.objectid, [parseTransform(component.transform), ...transforms], nextStack, depth + 1);
    }
  }

  for (const item of roots) appendObject(item.objectid, [parseTransform(item.transform)], new Set(), 0);
  return geometry.colors.length && !limitReached ? geometry : null;
}

export async function parse3mf(buffer: Buffer, fileName: string): Promise<ParsedPrint> {
  const zip = new AdmZip(buffer);

  const sliceInfoEntry = findEntry(zip, (n) => n.endsWith("slice_info.config"));
  const gcodeEntry = findEntry(zip, (n) => /plate_\d+\.gcode$/.test(n));
  const thumbEntry = findEntry(
    zip,
    (n) => /plate_\d+\.png$/.test(n) && !n.includes("small") && !n.includes("no_light")
  );

  if (!sliceInfoEntry) {
    throw new Error(
      "Diese Datei enthält keine unterstützten Bambu Studio / OrcaSlicer Slicing-Metadaten (slice_info.config)."
    );
  }

  const sliceInfo = parseSliceInfoConfig(sliceInfoEntry.getData().toString("utf-8"));
  if (!gcodeEntry) {
    const filaments = sliceInfo.filaments.map(toFilamentUsage);
    const totalWeightGrams =
      sliceInfo.plateWeight ?? filaments.reduce((sum, filament) => sum + filament.usedGramsTotal, 0);
    const printTimeSeconds = sliceInfo.predictionSeconds ?? 0;
    const filamentWeightGrams = filaments.reduce((sum, filament) => sum + filament.usedGramsTotal, 0);
    if (
      !Number.isFinite(totalWeightGrams) ||
      totalWeightGrams <= 0 ||
      !Number.isFinite(filamentWeightGrams) ||
      filamentWeightGrams <= 0 ||
      !Number.isFinite(printTimeSeconds) ||
      printTimeSeconds <= 0 ||
      filaments.length === 0 ||
      filaments.some((filament) => !Number.isFinite(filament.usedGramsTotal) || filament.usedGramsTotal < 0)
    ) {
      throw new Error(
        "Diese 3MF-Datei enthält keinen G-Code und nicht genügend Slicing-Metadaten für eine Kostenberechnung (Filamentgewicht und Druckzeit erforderlich)."
      );
    }

    const thumbnailBase64 = thumbEntry
      ? `data:image/png;base64,${thumbEntry.getData().toString("base64")}`
      : null;
    return {
      id: randomUUID(),
      fileName,
      displayName: fileName,
      createdAt: new Date().toISOString(),
      plate: {
        totalWeightGrams,
        printTimeSeconds,
        totalPrintTimeSeconds: printTimeSeconds,
        layerCount: 0,
        nozzleDiameterMm: null,
        printerModelId: sliceInfo.printerModelId,
        bedType: null,
        hasGcode: false,
        filaments,
        objects: [],
        categoryTotals: [],
        categoryByFilament: filaments.map((filament) => ({
          filamentId: filament.filamentId,
          categories: [],
          totalGrams: filament.usedGramsTotal,
        })),
        thumbnailBase64,
      },
    };
  }

  const gcode = gcodeEntry.getData().toString("utf-8");
  const header = parseGcodeHeader(gcode);
  const analysis = analyzeGcode(gcode);
  const traySlotMap = parseTraySlotMap(gcode); // 0-based T-slot -> tray_info_idx

  const thumbnailBase64 = thumbEntry
    ? `data:image/png;base64,${thumbEntry.getData().toString("base64")}`
    : null;

  // Map slot index (0-based, order in header) -> filament id used in slice_info.
  const slotIdToFilamentId = new Map<number, string>();
  header.filamentSlotToId.forEach((id, idx) => slotIdToFilamentId.set(idx, String(id)));

  // Prefer authoritative per-filament weights from slice_info; fall back to header order.
  const rawFilaments: RawFilament[] =
    sliceInfo.filaments.length > 0
      ? sliceInfo.filaments
      : header.filamentWeights.map((g, idx) => ({
          filamentId: String(slotIdToFilamentId.get(idx) ?? idx + 1),
          type: "Unbekannt",
          color: "#CCCCCC",
          usedGramsTotal: g,
          usedMetersTotal: header.filamentLengths[idx] ?? 0,
          usedForObject: true,
          usedForSupport: false,
          trayInfoIdx: "",
        }));
  const filaments = rawFilaments.map(toFilamentUsage);

  // Resolve gcode T-slot (physical AMS tray) -> slicer filament id via tray_info_idx.
  const trayIdxToFilamentId = new Map(rawFilaments.map((f) => [f.trayInfoIdx, f.filamentId]));
  const toolSlotToFilamentId = new Map<number, string>();
  traySlotMap.forEach((trayIdx, slot) => {
    const filamentId = trayIdxToFilamentId.get(trayIdx);
    if (filamentId) toolSlotToFilamentId.set(slot, filamentId);
  });
  const fallbackFilamentId = filaments[0]?.filamentId ?? "1";
  function resolveFilamentId(toolSlot: number): string {
    return toolSlotToFilamentId.get(toolSlot) ?? fallbackFilamentId;
  }

  const totalWeightGrams =
    sliceInfo.plateWeight ?? filaments.reduce((sum, f) => sum + f.usedGramsTotal, 0);

  // Build per-object-id -> per-category -> per-filament mm buckets.
  const objectIds = new Set<string>();
  const mmPerFilament = new Map<string, number>();
  const categoryMmByFilament = new Map<string, Map<PartCategory, number>>(); // filamentId -> category -> mm
  const perObjectCategoryFilamentMm = new Map<
    string,
    Map<PartCategory, Map<string, number>>
  >(); // objectId -> category -> filamentId -> mm

  for (const [key, mm] of analysis.buckets.entries()) {
    const { objectId, category, toolSlot } = parseBucketKey(key);
    const cat = (CATEGORY_ORDER.includes(category as PartCategory)
      ? category
      : "other") as PartCategory;
    const filamentId = resolveFilamentId(toolSlot);

    mmPerFilament.set(filamentId, (mmPerFilament.get(filamentId) ?? 0) + mm);
    if (!categoryMmByFilament.has(filamentId)) categoryMmByFilament.set(filamentId, new Map());
    const catMap = categoryMmByFilament.get(filamentId)!;
    catMap.set(cat, (catMap.get(cat) ?? 0) + mm);

    if (objectId !== "wipe_tower" && objectId !== "unassigned") {
      objectIds.add(objectId);
      if (!perObjectCategoryFilamentMm.has(objectId)) perObjectCategoryFilamentMm.set(objectId, new Map());
      const objCatMap = perObjectCategoryFilamentMm.get(objectId)!;
      if (!objCatMap.has(cat)) objCatMap.set(cat, new Map());
      const objFilMap = objCatMap.get(cat)!;
      objFilMap.set(filamentId, (objFilMap.get(filamentId) ?? 0) + mm);
    }
  }

  // Convert mm -> grams per filament using that filament's own authoritative total weight,
  // so per-filament totals always add up exactly to the slicer-reported values.
  const gramsPerMmByFilament = new Map<string, number>();
  for (const f of filaments) {
    const mm = mmPerFilament.get(f.filamentId) ?? 0;
    gramsPerMmByFilament.set(f.filamentId, mm > 0 ? f.usedGramsTotal / mm : 0);
  }

  const categoryByFilament: MaterialCategoryBreakdown[] = filaments.map((f) => {
    const catMap = categoryMmByFilament.get(f.filamentId) ?? new Map();
    const gramsPerMm = gramsPerMmByFilament.get(f.filamentId) ?? 0;
    const categories: CategoryBreakdown[] = CATEGORY_ORDER.filter((c) => catMap.has(c)).map(
      (c) => ({ category: c, grams: (catMap.get(c) ?? 0) * gramsPerMm })
    );
    return {
      filamentId: f.filamentId,
      categories,
      totalGrams: categories.reduce((s, c) => s + c.grams, 0),
    };
  });

  const categoryTotals: CategoryBreakdown[] = CATEGORY_ORDER.map((c) => ({
    category: c,
    grams: categoryByFilament.reduce(
      (sum, mf) => sum + (mf.categories.find((x) => x.category === c)?.grams ?? 0),
      0
    ),
  })).filter((c) => c.grams > 0);

  const nameById = new Map(sliceInfo.objects.map((o) => [o.identifyId, o.name]));
  const objects: ObjectBreakdown[] = Array.from(objectIds).map((objectId, idx) => {
    const objCatMap = perObjectCategoryFilamentMm.get(objectId) ?? new Map();
    const categories: CategoryBreakdown[] = [];
    const perFilamentGrams = new Map<string, number>();

    for (const cat of CATEGORY_ORDER) {
      const filMap = objCatMap.get(cat);
      if (!filMap) continue;
      let catGrams = 0;
      for (const [filamentId, mm] of filMap.entries()) {
        const grams = mm * (gramsPerMmByFilament.get(filamentId) ?? 0);
        catGrams += grams;
        perFilamentGrams.set(filamentId, (perFilamentGrams.get(filamentId) ?? 0) + grams);
      }
      categories.push({ category: cat, grams: catGrams });
    }

    const totalGrams = categories.reduce((s, c) => s + c.grams, 0);
    // model label ids / max heights are listed in the same order as objects appear in the header.
    const headerIdx = header.modelLabelIds.indexOf(objectId);
    const maxHeightMm =
      headerIdx >= 0 && header.objectMaxHeights[headerIdx] !== undefined
        ? header.objectMaxHeights[headerIdx]
        : null;
    return {
      objectId,
      name: nameById.get(objectId) ?? `Objekt ${idx + 1}`,
      maxHeightMm,
      categories,
      perFilament: Array.from(perFilamentGrams.entries()).map(([filamentId, grams]) => ({
        filamentId,
        grams,
      })),
      totalGrams,
    };
  });

  const plate: ParsedPlate = {
    totalWeightGrams,
    printTimeSeconds: header.modelPrintTimeSeconds,
    totalPrintTimeSeconds: header.totalEstimatedTimeSeconds || header.modelPrintTimeSeconds,
    layerCount: header.layerCount,
    nozzleDiameterMm: null,
    printerModelId: sliceInfo.printerModelId,
    bedType: null,
    hasGcode: true,
    filaments,
    objects,
    categoryTotals,
    categoryByFilament,
    thumbnailBase64,
  };

  return {
    id: randomUUID(),
    fileName,
    displayName: fileName,
    createdAt: new Date().toISOString(),
    plate,
  };
}
