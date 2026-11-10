import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

test("order invoice routes preserve saved pricing, validate snapshots and reserve numbers atomically", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pcc-order-invoice-"));
  const requireModule = createRequire(import.meta.url);
  const url = (relative: string) => JSON.stringify(new URL(relative, import.meta.url).href);
  const script = `
    import assert from "node:assert/strict";
    import { randomUUID } from "node:crypto";
    import * as db from ${url("./db/index.ts")};
    import * as invoices from ${url("../app/api/orders/[id]/invoice/route.ts")};
    import { formatDocumentNumber } from ${url("./invoice.ts")};
    const settings = await db.getSettings();
    settings.general.language = "en";
    settings.general.currency = "EUR";
    settings.costs.marginPercent = 90;
    settings.invoiceTemplates[0].elements.push({id:"test-values",type:"text",x:20,y:30,width:170,height:20,
      content:"{{printName}} | {{printWeight}} | {{printTime}} | {{dueDate}}"});
    await db.saveSettings(settings);
    const now = new Date().toISOString();
    const printIds = [randomUUID(),randomUUID()];
    for (const [index,id] of printIds.entries()) {
      await db.insertPrint({id,fileName:"Print "+index,createdAt:now,plate:{
        totalWeightGrams:10,totalPrintTimeSeconds:60,layerCount:1,nozzleDiameterMm:null,
        printerModelId:null,bedType:null,filaments:[],objects:[],categoryTotals:[],
        categoryByFilament:[],thumbnailBase64:null,
      }});
    }
    const snapshot = {version:1,savedAt:now,currency:"USD",laborRatePerHour:20,
      inputs:{laborMinutes:30,packagingCost:2,shippingCost:3,marginPercent:20,vatPercent:19,discountPercent:10},
      items:printIds.map((printId,index)=>({printId,printName:index===0?"Saved bracket":"Saved cover",
        quantity:index===0?2:1,materialCost:index===0?10:5,extraCost:0,energyCost:0,machineCost:0}))};
    let order = await db.saveOrder({id:randomUUID(),customerName:"Original contact",status:"open",dueDate:null,
      notes:"",createdAt:now,updatedAt:now,items:snapshot.items.map(({printId,quantity})=>({printId,quantity})),
      calculation:snapshot});
    const ctx={params:Promise.resolve({id:order.id})};
    const request=(body)=>new Request("http://localhost/api/orders/"+order.id+"/invoice",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const details={expectedUpdatedAt:order.updatedAt,templateId:settings.invoiceTemplates[0].id,
      number:formatDocumentNumber(settings.numbering.invoice),automaticNumber:true,preview:true,
      date:"2026-11-08",dueDate:"2026-11-30",customerName:"Invoice <contact>",
      customerAddress:"Historical billing",showQuantityDiscount:true};
    const preview = await invoices.POST(request(details),ctx);
    assert.equal(preview.status,200);
    const html=(await preview.json()).html;
    assert.match(html,/Saved bracket/);
    assert.match(html,/Saved cover/);
    assert.match(html,/Invoice &lt;contact&gt;/);
    assert.match(html,/Historical billing/);
    assert.match(html,/\\$51\\.41/);
    assert.match(html,/30\\.0 g/);
    assert.match(html,/Tax \\(19 %\\)/);
    assert.doesNotMatch(html,/window\\.print\\(\\)/);
    const rowAmounts=[...html.matchAll(/<tr><td>Saved [^<]+<\\/td><td>\\d+<\\/td><td>[^<]+<\\/td><td>\\$([\\d.]+)<\\/td><\\/tr>/g)]
      .map((match)=>Math.round(Number(match[1])*100));
    assert.equal(rowAmounts.length,2);
    assert.equal(rowAmounts.reduce((sum,amount)=>sum+amount,0),5141);
    assert.equal((await db.getSettings()).numbering.invoice.nextNumber,1);
    assert.deepEqual((await db.listOrders()).find((entry)=>entry.id===order.id),order);
    const exports=await Promise.all([1,2].map(()=>invoices.POST(request({...details,preview:false}),ctx)));
    assert.deepEqual(exports.map((response)=>response.status).sort(),[200,409]);
    assert.equal((await db.getSettings()).numbering.invoice.nextNumber,2);
    assert.equal((await invoices.POST(request({...details,preview:false,automaticNumber:false,number:"MANUAL-42"}),ctx)).status,200);
    assert.equal((await db.getSettings()).numbering.invoice.nextNumber,2);
    assert.equal((await invoices.POST(request({...details,date:"not-a-date"}),ctx)).status,400);
    assert.equal((await invoices.POST(request({...details,expectedUpdatedAt:"2000-01-01T00:00:00.000Z"}),ctx)).status,409);
    assert.equal((await invoices.POST(request({...details,templateId:"missing"}),ctx)).status,404);
    order = await db.saveOrder({...order,items:[{printId:printIds[0],quantity:99}]});
    assert.equal((await invoices.POST(request({...details,expectedUpdatedAt:order.updatedAt}),ctx)).status,409);
    order = await db.saveOrder({...order,calculation:undefined});
    assert.equal((await invoices.POST(request({...details,expectedUpdatedAt:order.updatedAt}),ctx)).status,409);
    assert.equal((await db.getSettings()).numbering.invoice.nextNumber,2);
    console.log("Order invoices verified");
  `;
  try {
    const result = spawnSync(process.execPath, [
      "--import", pathToFileURL(requireModule.resolve("tsx")).href, "--input-type=module", "--eval", script,
    ], {
      cwd: directory, env: { ...process.env, AUTH_ENABLED: "false", DB_DRIVER: "sqlite", TSX_TSCONFIG_PATH: path.resolve("tsconfig.json") },
      encoding: "utf8", timeout: 60_000,
    });
    assert.equal(result.status, 0, `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`);
    assert.ok(result.stdout.includes("Order invoices verified"));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
