import type { ModelGeometry } from "../types";

type Point = [number, number, number];

/** Retains every depositing move, excluding travel and custom machine routines. */
export function parseGcodeGeometry(gcode: string): ModelGeometry | null {
  const steps = gcodeGeometrySteps(gcode);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

export function* gcodeGeometrySteps(gcode: string): Generator<void, ModelGeometry | null> {
  const palette = /^;\s*filament_colour\s*=\s*(.+)$/m.exec(gcode)?.[1].trim().split(";");
  const widths: number[] = [];
  const heights: number[] = [];
  const geometry: ModelGeometry = { kind: "toolpath", positions: [], colors: [], widths, heights };
  let width = Number(/^;\s*line_width\s*=\s*([\d.]+)/m.exec(gcode)?.[1] ?? 0.4);
  let height = Number(/^;\s*layer_height\s*=\s*([\d.]+)/m.exec(gcode)?.[1] ?? 0.2);
  let position: Point = [0, 0, 0];
  let absolutePosition = true;
  let relativeExtrusion = true;
  let extrusion = 0;
  let unit = 1;
  let tool = 0;
  let printing = false;

  function append(start: Point, end: Point) {
    if (start.every((value, axis) => value === end[axis])) return;
    geometry.positions.push(...start, ...end);
    geometry.colors.push(palette?.[tool] ?? "#94a3b8");
    widths.push(width);
    heights.push(height);
  }

  let lines = 0;
  for (const match of gcode.matchAll(/[^\r\n]+/g)) {
    if (++lines % 512 === 0) yield;
    const line = match[0].trim();
    const dimension = /^;\s*(LINE_WIDTH|LAYER_HEIGHT):\s*([\d.]+)/.exec(line);
    if (dimension) {
      const value = Number(dimension[2]);
      if (value > 0 && Number.isFinite(value)) {
        if (dimension[1] === "LINE_WIDTH") width = value;
        else height = value;
      }
      continue;
    }
    const feature = /^;\s*(?:FEATURE|TYPE):\s*(.*)/i.exec(line);
    if (feature) {
      printing = !/custom/i.test(feature[1]);
      continue;
    }
    const command = /^([GMT])(\d+)\b/.exec(line);
    if (!command) continue;
    const code = Number(command[2]);
    const values: Record<string, number> = {};
    for (const parameter of line.split(";")[0].slice(command[0].length).matchAll(/([XYZEFIJR])\s*(-?(?:\d+\.?\d*|\.\d+))/gi)) {
      values[parameter[1].toUpperCase()] = Number(parameter[2]);
    }
    if (command[1] === "T") {
      if (code <= 32) tool = code;
      continue;
    }
    if (command[1] === "M") {
      if (code === 82) relativeExtrusion = false;
      if (code === 83) relativeExtrusion = true;
      continue;
    }
    if (code === 90) absolutePosition = true;
    if (code === 91) absolutePosition = false;
    if (code === 20) unit = 25.4;
    if (code === 21) unit = 1;
    if (code === 92) {
      position = position.map((value, axis) => values["XYZ"[axis]] === undefined ? value : values["XYZ"[axis]] * unit) as Point;
      if (values.E !== undefined) extrusion = values.E * unit;
      continue;
    }
    if (code < 0 || code > 3) continue;
    const end = position.map((value, axis) => {
      const coordinate = values["XYZ"[axis]];
      return coordinate === undefined ? value : coordinate * unit + (absolutePosition ? 0 : value);
    }) as Point;
    const deltaE = values.E === undefined ? 0 : values.E * unit - (relativeExtrusion ? 0 : extrusion);
    if (values.E !== undefined) extrusion = relativeExtrusion ? extrusion + values.E * unit : values.E * unit;
    if (printing && deltaE > 0) {
      if ((code === 2 || code === 3) && (values.I !== undefined || values.J !== undefined)) {
        const cx = position[0] + (values.I ?? 0) * unit;
        const cy = position[1] + (values.J ?? 0) * unit;
        const radius = Math.hypot(position[0] - cx, position[1] - cy);
        const startAngle = Math.atan2(position[1] - cy, position[0] - cx);
        let sweep = Math.atan2(end[1] - cy, end[0] - cx) - startAngle;
        if (code === 2 && sweep >= 0) sweep -= 2 * Math.PI;
        if (code === 3 && sweep <= 0) sweep += 2 * Math.PI;
        const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
        let previous = position;
        for (let step = 1; step <= steps; step++) {
          const angle = startAngle + sweep * step / steps;
          const next: Point = step === steps ? end : [
            cx + radius * Math.cos(angle),
            cy + radius * Math.sin(angle),
            position[2] + (end[2] - position[2]) * step / steps,
          ];
          append(previous, next);
          previous = next;
        }
      } else {
        append(position, end);
      }
    }
    position = end;
  }
  return geometry.colors.length ? geometry : null;
}
