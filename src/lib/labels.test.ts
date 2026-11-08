import assert from "node:assert/strict";
import { test } from "node:test";
import { createLabelTemplate, labelContent, labelTemplateSchema, moveLabelElement, type LabelTemplate } from "./labelTemplates";
import { LabelError, labelPrintDocument, renderLabel } from "./labels";
import { defaultSettings, migrateSettings } from "./db/shared";
import { settingsSchema } from "./api/schemas";

const item = { name: "Example clips", id: "12345678-1234-4234-8234-123456789abc", numericId: 42 };

test("template migration and variable substitution preserve old settings", () => {
  const { labelTemplates, ...legacy } = defaultSettings;
  assert.deepEqual(labelTemplates, []);
  assert.deepEqual(migrateSettings(legacy).labelTemplates, []);
  assert.deepEqual(settingsSchema.parse(legacy).labelTemplates, []);
  assert.deepEqual(settingsSchema.parse(legacy).productTypes, []);
  assert.equal(labelContent("{{name}} / {{id}} / custom", item), `${item.name} / ${item.id} / custom`);
  assert.equal(labelContent("{{numericId}}", item), "42");
});

test("template geometry rejects out-of-bounds elements, overlapping codes and tiny codes", () => {
  const template = createLabelTemplate("test", "Fixture");
  assert.equal(labelTemplateSchema.safeParse(template).success, true);
  for (const invalid of [
    { ...template, width: 14 },
    { ...template, elements: template.elements.map((element) => ({ ...element, x: 100 })) },
    { ...template, elements: [...template.elements, template.elements[0]] },
    { ...template, elements: template.elements.map((element) => element.type === "qr" ? { ...element, width: 10 } : element) },
    { ...template, elements: template.elements.map((element) => ({ ...element, x: 0, y: 0 })) },
  ]) assert.equal(labelTemplateSchema.safeParse(invalid).success, false);
  const element = template.elements[0];
  const moved = moveLabelElement(element, 100, -10, template);
  assert.equal(moved.x, template.width - element.width);
  assert.equal(moved.y, 0);
  assert.equal(moveLabelElement(element, 2.34, 3.45, template).x, 2.3);
});

test("rendered label and print document use exact millimeter dimensions with local embedded QR", async () => {
  const template = createLabelTemplate("test", "Fixture");
  const svg = await renderLabel(template, item);
  assert.match(svg, /width="70mm" height="40mm" viewBox="0 0 70 40"/);
  assert.match(svg, /Example clips/);
  assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(svg, /href="data:image\/svg\+xml;base64,/);
  const embedded = svg.match(/href="data:image\/svg\+xml;base64,([^"]+)"/)?.[1];
  assert.ok(embedded);
  assert.match(Buffer.from(embedded, "base64").toString(), /<path/);
  const html = labelPrintDocument(template, svg);
  assert.match(html, /@page\{size:70mm 40mm;margin:0\}/);
  assert.doesNotMatch(html, /https?:\/\/|<script/);
});

test("Code 128 uses custom content or IDs and enforces readable bar width", async () => {
  const template: LabelTemplate = {
    id: "barcode", name: "Barcode", width: 120, height: 25,
    elements: [{ id: "code", type: "barcode", content: "{{id}}", x: 5, y: 5, width: 110, height: 15, fontSize: 10 }],
  };
  const svg = await renderLabel(template, item);
  assert.match(svg, /preserveAspectRatio="none"/);
  const custom = await renderLabel({ ...template, elements: [{ ...template.elements[0], content: "CLIPS-42" }] }, item);
  assert.notEqual(svg, custom);
  const numeric = await renderLabel({ ...template, elements: [{ ...template.elements[0], content: "{{numericId}}" }] }, item);
  assert.equal(numeric, await renderLabel({ ...template, elements: [{ ...template.elements[0], content: "42" }] }, item));
  await assert.rejects(renderLabel({ ...template, elements: [{ ...template.elements[0], width: 15 }] }, item),
    (error: unknown) => error instanceof LabelError && error.message === "labels.error.codeFit");
  await assert.rejects(renderLabel({ ...template, elements: [{ ...template.elements[0], content: "Schlüssel" }] }, item),
    (error: unknown) => error instanceof LabelError && error.message === "labels.error.barcode");
});

test("numeric ID renders as text and QR and fails explicitly when missing", async () => {
  const template = createLabelTemplate("numeric", "Numeric");
  template.elements = template.elements.map((element) => ({ ...element, content: "{{numericId}}" }));
  const svg = await renderLabel(template, item);
  assert.match(svg, />42<\/tspan>/);
  assert.equal(svg, await renderLabel({ ...template, elements: template.elements.map((element) => ({ ...element, content: "42" })) }, item));
  await assert.rejects(renderLabel(template, { name: item.name, id: item.id }),
    (error: unknown) => error instanceof LabelError && error.message === "labels.error.numericId");
});

test("text is XML escaped and overflowing text is explicitly rejected", async () => {
  const template: LabelTemplate = {
    id: "text", name: "Text", width: 80, height: 30,
    elements: [{ id: "text", type: "text", content: "{{name}}", x: 2, y: 2, width: 76, height: 25, fontSize: 8 }],
  };
  const svg = await renderLabel(template, { ...item, name: "<script>alert('x')</script>" });
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
  await assert.rejects(renderLabel({ ...template, elements: [{ ...template.elements[0], width: 2, height: 2 }] }, item),
    (error: unknown) => error instanceof LabelError && error.message === "labels.error.textFit");
});
