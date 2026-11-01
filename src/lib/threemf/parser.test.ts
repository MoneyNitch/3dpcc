import assert from "node:assert/strict";
import { test } from "node:test";
import AdmZip from "adm-zip";
import { parse3mf } from "./parser";

function metadataArchive({ weight = "43.24", prediction = "4484" } = {}) {
  const zip = new AdmZip();
  zip.addFile(
    "Metadata/slice_info.config",
    Buffer.from(`<config><plate>
      <metadata key="prediction" value="${prediction}"/>
      <metadata key="weight" value="${weight}"/>
      <metadata key="printer_model_id" value="C12"/>
      <object identify_id="1831" name="Cleaner"/>
      <filament id="3" tray_info_idx="GFA01" type="PLA" color="#000000" used_m="13.62" used_g="43.24"/>
    </plate></config>`)
  );
  return zip.toBuffer();
}

function multiPlateArchive() {
  const zip = new AdmZip();
  zip.addFile(
    "Metadata/slice_info.config",
    Buffer.from(`<config>
      <plate>
        <metadata key="index" value="1"/><metadata key="weight" value="12"/>
        <metadata key="prediction" value="3600"/>
        <object identify_id="101" name="Frame"/>
        <filament id="1" type="PLA" color="#FF0000" used_m="4" used_g="12"/>
      </plate>
      <plate>
        <metadata key="index" value="2"/><metadata key="weight" value="24"/>
        <metadata key="prediction" value="7200"/>
        <object identify_id="202" name="Drawer"/>
        <filament id="2" type="PETG" color="#00FF00" used_m="8" used_g="24"/>
      </plate>
    </config>`)
  );
  for (const [index, color] of [[1, "#FF0000"], [2, "#00FF00"]] as const) {
    zip.addFile(`Metadata/plate_${index}.png`, Buffer.from(`thumbnail-${index}`));
    zip.addFile(
      `Metadata/plate_${index}.gcode`,
      Buffer.from(`; model printing time: ${index}h 0m 0s; total estimated time: ${index}h 0m 0s
; total layer number: 100
; total filament weight [g] : 12
; total filament length [mm] : 4000
; filament: ${index}
; model label id: ${index === 1 ? 101 : 202}
; object max height: 10
; HEADER_BLOCK_END
; filament_colour = ${color}
; FEATURE: Outer wall
G1 X10 Y10 Z0.2 E1
`),
    );
  }
  return zip.toBuffer();
}

test("parses sliced 3MF metadata without G-code for price calculation", async () => {
  const print = await parse3mf(metadataArchive(), "Cleaner.3mf");

  assert.equal(print.plate.hasGcode, false);
  assert.equal(print.plate.totalWeightGrams, 43.24);
  assert.equal(print.plate.totalPrintTimeSeconds, 4484);
  assert.equal(print.plate.filaments[0].type, "PLA");
  assert.equal(print.plate.filaments[0].usedGramsTotal, 43.24);
  assert.equal(print.plate.categoryByFilament[0].totalGrams, 43.24);
  assert.deepEqual(print.plate.categoryTotals, []);
  assert.deepEqual(print.plate.objects, []);
});

test("parses every plate and associates its own metadata, thumbnail, and G-code", async () => {
  const print = await parse3mf(multiPlateArchive(), "Organizer.3mf");

  assert.equal(print.plates?.length, 2);
  assert.deepEqual(print.plates?.map((plate) => plate.plateIndex), [1, 2]);
  assert.deepEqual(print.plates?.map((plate) => plate.totalWeightGrams), [12, 24]);
  assert.deepEqual(print.plates?.map((plate) => plate.totalPrintTimeSeconds), [3600, 7200]);
  assert.deepEqual(print.plates?.map((plate) => plate.filaments[0].type), ["PLA", "PETG"]);
  assert.notEqual(print.plates?.[0].thumbnailBase64, print.plates?.[1].thumbnailBase64);
  assert.equal(print.plate, print.plates?.[0]);
});

test("rejects sliced 3MF metadata without usable filament weight or print time", async () => {
  await assert.rejects(
    parse3mf(metadataArchive({ weight: "0" }), "Cleaner.3mf"),
    /Filamentgewicht und Druckzeit erforderlich/
  );
  await assert.rejects(
    parse3mf(metadataArchive({ prediction: "0" }), "Cleaner.3mf"),
    /Filamentgewicht und Druckzeit erforderlich/
  );
});
