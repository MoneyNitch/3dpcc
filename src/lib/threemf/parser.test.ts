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
