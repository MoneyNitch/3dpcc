import assert from "node:assert/strict";
import { test } from "node:test";
import AdmZip from "adm-zip";
import { parseGcodeGeometry } from "./gcodeGeometry";
import { parse3mfGeometry } from "./parser";
import { getToolpathLayerHeights } from "../toolpathLayers";

test("renders only depositing print moves, preserving tool colors and ignoring placeholder tools", () => {
  const geometry = parseGcodeGeometry(`
; filament_colour = #FFFFFF;#FF0000
G90
M83
G1 X10 Y20 Z1
; FEATURE: Custom
G1 X20 E2
; FEATURE: Outer wall
T1
G1 X30 E1
G1 X40
G1 X50 E-1
T65535
G1 X60 E1
`);
  assert.equal(geometry?.kind, "toolpath");
  assert.deepEqual(geometry?.positions, [20, 20, 1, 30, 20, 1, 50, 20, 1, 60, 20, 1]);
  assert.deepEqual(geometry?.colors, ["#FF0000", "#FF0000"]);
});

test("handles relative positions, absolute extrusion and G92 resets", () => {
  const geometry = parseGcodeGeometry(`
; TYPE:WALL-OUTER
M82
G1 X1 Y2 Z3 E1
G91
G1 X2 E2
G92 E0
G1 Y3 E1
G1 X1 E0
`);
  assert.deepEqual(geometry?.positions, [
    0, 0, 0, 1, 2, 3,
    1, 2, 3, 3, 2, 3,
    3, 2, 3, 3, 5, 3,
  ]);
});

test("subdivides clockwise, counterclockwise and full-circle XY arcs", () => {
  for (const command of ["G2", "G3"]) {
    const geometry = parseGcodeGeometry(`G1 X1 Y0\n; FEATURE: Outer wall\n${command} X-1 Y0 I-1 J0 Z1 E1`);
    assert.equal(geometry?.colors.length, 12);
    assert.deepEqual(geometry?.positions.slice(-3), [-1, 0, 1]);
    assert.ok(geometry && geometry.positions.every(Number.isFinite));
    assert.ok(geometry && (command === "G2" ? geometry.positions[4] < 0 : geometry.positions[4] > 0));
  }
  const circle = parseGcodeGeometry("G1 X1\n; FEATURE: Outer wall\nG2 I-1 J0 E1");
  assert.equal(circle?.colors.length, 24);
  assert.deepEqual(circle?.positions.slice(-3), [1, 0, 0]);
});

test("retains every segment of a large print without sampling", () => {
  const geometry = parseGcodeGeometry("; FEATURE: Outer wall\n" +
    Array.from({ length: 200_000 }, (_, i) => `G1 X${i + 1} Z${i / 1000} E1`).join("\n"));
  assert.ok(geometry);
  assert.equal(geometry.colors.length, 200_000);
  assert.equal(geometry.positions.length, geometry.colors.length * 6);
  assert.equal(geometry.positions[0], 0);
  assert.equal(geometry.positions.at(-3), 200_000);
});

test("preserves slicer extrusion width and layer height changes", () => {
  const geometry = parseGcodeGeometry("; FEATURE: Outer wall\n; LINE_WIDTH: 0.25\n; LAYER_HEIGHT: 0.1\nG1 X1 E1\n; LINE_WIDTH: 0.3\nG1 X2 E1");
  assert.deepEqual(geometry?.widths, [0.25, 0.3]);
  assert.deepEqual(geometry?.heights, [0.1, 0.1]);
});

test("finds printable layer heights from horizontal extrusion segments", () => {
  const geometry = parseGcodeGeometry(`; FEATURE: Outer wall
G1 X1 Z0.2
G1 X2 E1
G1 X3 Z0.4
G1 X4 E1
G1 X5 Z0.6
G1 X6 E1`);
  assert.ok(geometry);
  assert.deepEqual(getToolpathLayerHeights(geometry), [0.2, 0.4, 0.6]);
});

test("returns null for travel-only G-code", () => {
  assert.equal(parseGcodeGeometry("; FEATURE: Outer wall\nG1 X10\nG1 E5\nG1 X20 E-1"), null);
});

test("prefers G-code paths for layer preview and uses meshes when no paths are available", () => {
  const zip = new AdmZip();
  zip.addFile("Metadata/plate_1.gcode", Buffer.from("; FEATURE: Outer wall\nG1 X10 E1"));
  assert.equal(parse3mfGeometry(zip.toBuffer())?.kind, "toolpath");
  zip.addFile("3D/3dmodel.model", Buffer.from("<model><resources></resources><build/></model>"));
  assert.equal(parse3mfGeometry(zip.toBuffer())?.kind, "toolpath");
  zip.addFile("3D/3dmodel.model", Buffer.from(`<model><resources><object id="1"><mesh>
    <vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices>
    <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
    </mesh></object></resources><build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 5 0 0"/></build></model>`));
  assert.equal(parse3mfGeometry(zip.toBuffer())?.kind, "toolpath");
  const meshZip = new AdmZip();
  meshZip.addFile("3D/3dmodel.model", zip.getEntry("3D/3dmodel.model")!.getData());
  const mesh = parse3mfGeometry(meshZip.toBuffer());
  assert.notEqual(mesh?.kind, "toolpath");
  assert.deepEqual(mesh?.positions, [5, 0, 0, 6, 0, 0, 5, 1, 0]);
});

test("selects toolpath geometry from the requested plate", () => {
  const zip = new AdmZip();
  zip.addFile("Metadata/plate_1.gcode", Buffer.from(
    "; filament_colour = #ff0000\n; FEATURE: Outer wall\nG1 X10 Y0 Z0.2 E1\n",
  ));
  zip.addFile("Metadata/plate_2.gcode", Buffer.from(
    "; filament_colour = #00ff00\n; FEATURE: Outer wall\nG1 X20 Y0 Z0.2 E1\n",
  ));
  const buffer = zip.toBuffer();

  const first = parse3mfGeometry(buffer, 1);
  const second = parse3mfGeometry(buffer, 2);

  assert.equal(first?.colors[0], "#ff0000");
  assert.equal(second?.colors[0], "#00ff00");
  assert.notDeepEqual(first?.positions, second?.positions);
});
