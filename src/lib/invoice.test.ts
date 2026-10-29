import assert from "node:assert/strict";
import { test } from "node:test";
import { allocateInvoiceAmounts, renderInvoiceHtml, sampleInvoiceResult } from "./invoice";
import type { InvoiceTemplate } from "./types";

const template: InvoiceTemplate = {
  id: "multi-plate",
  name: "Multi-plate",
  paperFormat: "A4",
  orientation: "portrait",
  elements: [
    { id: "company", type: "text", x: 20, y: 15, width: 100, height: 25, content: "{{companyName}}\n{{companyAddress}}" },
    { id: "items", type: "lineItems", x: 20, y: 90, width: 170, height: 100 },
    { id: "totals", type: "totals", x: 110, y: 195, width: 80, height: 45 },
    { id: "footer", type: "text", x: 20, y: 270, width: 170, height: 15, content: "Thank you" },
  ],
};

test("multi-plate invoice and quote tables are compact and move following template elements when needed", async () => {
  const html = await renderInvoiceHtml({
    template,
    values: {
      companyName: "Example Studio",
      companyAddress: "1 Main Street",
      vatPercent: "19",
    },
    result: sampleInvoiceResult,
    money: (value) => `${value.toFixed(2)} €`,
    positionItems: Array.from({ length: 17 }, (_, index) => ({
      name: `Plate ${index + 1}`,
      quantity: 1,
      unitPrice: 10,
      amount: 10,
    })),
  });

  assert.match(html, /class="line-items"><table class="items">/);
  assert.equal((html.match(/<tr><td>Plate \d+<\/td>/g) ?? []).length, 17);
  assert.match(html, /padding:2px 6px[^}]*font-size:8\.5pt;line-height:1\.1/);
  assert.match(html, /table\.getBoundingClientRect\(\)\.height/);
  assert.match(html, /element\.style\.top = \(originalY \+ shift\) \+ 'mm'/);
  assert.match(html, /data-template-y="195"/);
  assert.match(html, /data-template-y="270"/);
  assert.match(html, /Example Studio/);
  assert.match(html, /1 Main Street/);
  assert.doesNotMatch(html, /\{\{(?:companyName|companyAddress|vatPercent)\}\}/);
});

test("allocated all-plate invoice positions add up exactly to the selected total", () => {
  const amounts = allocateInvoiceAmounts(167.45, [28.14, 17.2, 33.65, 12.57, 8.19]);
  assert.equal(amounts.reduce((sum, amount) => sum + amount, 0), 167.45);
  assert.deepEqual(allocateInvoiceAmounts(10, [0, 0, 0]), [3.33, 3.33, 3.34]);
});

test("quantity discount row can be included or omitted without changing the invoice total", async () => {
  const discountResult = {
    ...sampleInvoiceResult,
    quantityDiscountAmount: 0.75,
    quantityDiscountPercent: 5,
    totalPrice: 17.1,
  };
  const common = {
    template,
    values: {},
    result: discountResult,
    money: (value: number) => `${value.toFixed(2)} €`,
    quantityDiscountLabel: "Quantity discount",
  };

  const shown = await renderInvoiceHtml({ ...common, showQuantityDiscount: true });
  const hidden = await renderInvoiceHtml({ ...common, showQuantityDiscount: false });

  assert.match(shown, /Quantity discount \(5 %\)/);
  assert.match(shown, /−0\.75 €/);
  assert.doesNotMatch(hidden, /Quantity discount/);
  assert.match(shown, /17\.10 €/);
  assert.match(hidden, /17\.10 €/);
  assert.match(shown, /12\.00 €/);
  assert.match(hidden, /11\.25 €/);
});
