// Parses the G-code body of a Bambu Studio / OrcaSlicer plate to estimate how much
// filament (in mm of extrusion) went into each printed object, part category
// (model / support / prime tower) and active filament/tool. The ratios are later
// combined with the slicer-reported total filament weight (authoritative) to
// estimate grams per bucket.

export type GcodeCategory = "model" | "support" | "tower" | "other";

export interface GcodeBucketKey {
  objectId: string; // "wipe_tower" for the prime tower, "unassigned" before first object marker
  category: GcodeCategory;
  toolSlot: number; // physical AMS/tool slot (T-number), -1 if unknown
}

export interface GcodeAnalysis {
  /** mm of positive extrusion per (objectId, category, toolSlot) bucket */
  buckets: Map<string, number>;
  totalExtrusionMm: number;
}

function bucketKey(objectId: string, category: GcodeCategory, toolSlot: number): string {
  return `${objectId}::${category}::${toolSlot}`;
}

export function parseBucketKey(key: string): GcodeBucketKey {
  const [objectId, category, toolSlot] = key.split("::");
  return { objectId, category: category as GcodeCategory, toolSlot: parseInt(toolSlot, 10) };
}

function classifyFeature(feature: string): GcodeCategory {
  const f = feature.toLowerCase();
  if (f.includes("support")) return "support";
  if (f.includes("prime tower") || f.includes("wipe tower")) return "tower";
  if (f.includes("skirt") || f.includes("brim") || f.includes("custom")) return "other";
  return "model";
}

const OBJECT_ID_RE = /^;\s*OBJECT_ID:\s*(\S+)/;
const FEATURE_RE = /^;\s*FEATURE:\s*(.+)/;
const E_RE = /\bE(-?[0-9]*\.?[0-9]+)/;
const M83_RE = /^M83\b/;
const M82_RE = /^M82\b/;
// Real tool/filament selects are small slot numbers (e.g. T0..T15). Larger values
// (T1000, T65535, ...) are firmware placeholders for "no tool" / maintenance moves.
const TOOL_RE = /^T(\d+)\b/;
const MAX_REAL_TOOL_SLOT = 32;

export function analyzeGcode(gcode: string): GcodeAnalysis {
  const buckets = new Map<string, number>();
  let currentObject = "unassigned";
  let currentCategory: GcodeCategory = "other";
  let currentTool = -1;
  let inWipeTower = false;
  let relativeExtrusion = true; // Bambu/Orca default to M83
  let lastAbsoluteE = 0;
  let totalExtrusionMm = 0;

  const lines = gcode.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    if (line.startsWith(";")) {
      const objMatch = OBJECT_ID_RE.exec(line);
      if (objMatch) {
        currentObject = objMatch[1];
        continue;
      }
      const featMatch = FEATURE_RE.exec(line);
      if (featMatch) {
        currentCategory = classifyFeature(featMatch[1]);
        continue;
      }
      if (line.includes("WIPE_TOWER_START")) {
        inWipeTower = true;
        continue;
      }
      if (line.includes("WIPE_TOWER_END")) {
        inWipeTower = false;
        continue;
      }
      continue;
    }

    if (M83_RE.test(line)) {
      relativeExtrusion = true;
      continue;
    }
    if (M82_RE.test(line)) {
      relativeExtrusion = false;
      continue;
    }

    const toolMatch = TOOL_RE.exec(line);
    if (toolMatch) {
      const slot = parseInt(toolMatch[1], 10);
      if (slot <= MAX_REAL_TOOL_SLOT) currentTool = slot;
      continue;
    }

    if ((line.startsWith("G1") || line.startsWith("G0")) && line.includes("E")) {
      const match = E_RE.exec(line);
      if (!match) continue;
      const eValue = parseFloat(match[1]);
      let delta: number;
      if (relativeExtrusion) {
        delta = eValue;
      } else {
        delta = eValue - lastAbsoluteE;
        lastAbsoluteE = eValue;
      }
      if (delta > 0) {
        const key = inWipeTower
          ? bucketKey("wipe_tower", "tower", currentTool)
          : bucketKey(currentObject, currentCategory, currentTool);
        buckets.set(key, (buckets.get(key) ?? 0) + delta);
        totalExtrusionMm += delta;
      }
      continue;
    }

    if (line.startsWith("G92") && line.includes("E")) {
      const match = E_RE.exec(line);
      if (match) lastAbsoluteE = parseFloat(match[1]);
    }
  }

  return { buckets, totalExtrusionMm };
}

