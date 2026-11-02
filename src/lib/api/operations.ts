import { z } from "zod";
import { authEnabled, requestIdentity } from "../auth/server";
import { canUpdateSettings } from "../auth/settings";
import { isPrintLinkedToOrderError, type DataStore } from "../db/shared";
import type { AppSettings, InvoiceCostLine, ParsedPlate, ParsedPrint, PrintCostInputs } from "../types";
import { calculateAllPlatesCost, calculateCost, defaultCostInputs } from "../costCalculator";
import { manualBreakdown, parseManualCategories, parseManualFilaments } from "../manualPrint";
import { allocateInvoiceAmounts, renderInvoiceHtml } from "../invoice";
import { getIntlLocale, parseLanguagePack, translate } from "../i18n";
import { formatDuration } from "../format";
import { originalArchives, originalDownload } from "../originalArchives";
import { plateNameSchema, renamePlate } from "../plateNames";
import { ApiError, fromInternal, json, parse, readBody, readJson } from "./http";
import {
  accessorySchema, calculationSchema, costInputsPatchSchema, costInputsSchema, documentSchema,
  idSchema, listQuerySchema, manualSchema, materialSchema, plateQuerySchema, plateSchema,
  printerSchema, printSchema, renameSchema, resultSchema, settingsPatchSchema, settingsSchema, templateSchema,
} from "./schemas";

export interface ApiDependencies {
  store: Pick<DataStore, "getSettings" | "saveSettings" | "listPrints" | "getPrint" | "insertPrint" |
    "savePrint" | "updatePrintName" | "deletePrint" | "getPrintCostInputs" | "savePrintCostInputs" | "listOrders">;
  upload(request: Request): Promise<Response>;
  splitPlates(request: Request, id: string): Promise<Response>;
  model(request: Request, id: string): Promise<Response>;
  retryModel(request: Request, id: string): Promise<Response>;
  cancelPreview(id: string): Promise<void>;
  settingsChanged(): Promise<void>;
}

interface ApiResponse {
  description: string;
  schema?: z.ZodType;
  mediaType?: string;
}
export interface Operation {
  method: string;
  path: string;
  operationId: string;
  tag: string;
  summary: string;
  description?: string;
  body?: z.ZodType;
  mediaType?: string;
  query?: z.ZodType;
  pathSchema?: z.ZodType;
  responses: Record<number, ApiResponse>;
  execute(request: Request, params: Record<string, string>): Promise<Response>;
}

const globalApi = globalThis as typeof globalThis & { __pccApiSettingsLock?: Promise<unknown> };
function exclusiveSettings<T>(action: () => Promise<T>): Promise<T> {
  const result = (globalApi.__pccApiSettingsLock ?? Promise.resolve()).then(action);
  globalApi.__pccApiSettingsLock = result.then(() => {}, () => {});
  return result;
}

export function createOperations(dependencies: ApiDependencies): Operation[] {
  const { store } = dependencies;
  const operations: Operation[] = [];
  function validateContext(config: Pick<Operation, "pathSchema" | "query">, request: Request, params: Record<string, string>) {
    if (config.pathSchema) parse(config.pathSchema, params);
    if (config.query) parse(config.query, Object.fromEntries(new URL(request.url).searchParams));
    else if (new URL(request.url).searchParams.size > 0) {
      throw new ApiError(400, "validation_error", "This endpoint does not accept query parameters.");
    }
  }
  function add<T extends z.ZodType>(
    config: Omit<Operation, "execute" | "body"> & {
      body: T;
      handler(request: Request, params: Record<string, string>, body: z.output<T>): Promise<Response>;
    },
  ) {
    const { handler, ...metadata } = config;
    operations.push({
      ...metadata,
      async execute(request, params) {
        validateContext(config, request, params);
        return handler(request, params, parse(config.body, await readJson(request)));
      },
    });
  }
  function addRead(config: Omit<Operation, "execute" | "body"> & {
    handler(request: Request, params: Record<string, string>): Promise<Response>;
  }) {
    const { handler, ...metadata } = config;
    operations.push({ ...metadata, async execute(request, params) {
      validateContext(config, request, params);
      return handler(request, params);
    } });
  }
  const ok = { 200: { description: "Success", schema: z.object({ ok: z.literal(true) }) } };
  const printPath = z.strictObject({ id: z.uuid() });
  async function requirePrint(id: string): Promise<ParsedPrint> {
    const print = await store.getPrint(id);
    if (!print) throw new ApiError(404, "not_found", "Print not found.");
    return print;
  }
  async function persistSettings(raw: unknown, request: Request): Promise<AppSettings> {
    const settings = parse(settingsSchema, raw);
    if (authEnabled()) {
      const user = await requestIdentity(request, true);
      const current = await store.getSettings();
      if (!canUpdateSettings(user, current, settings)) {
        throw new ApiError(403, "forbidden", "Your role does not permit changing these settings.");
      }
    }
    let packs;
    try {
      packs = settings.customLanguagePacks.map(parseLanguagePack);
    } catch (error) {
      throw new ApiError(400, "validation_error", error instanceof Error ? error.message : "Invalid language pack.");
    }
    if (new Set(packs.map((pack) => pack.code)).size !== packs.length ||
      JSON.stringify(packs).length > 2_000_000) {
      throw new ApiError(400, "validation_error", "Language packs must have unique codes and not exceed 2 MB.");
    }
    await store.saveSettings(settings);
    await dependencies.settingsChanged();
    return settings;
  }
  async function effectiveInputs(id: string, settings: AppSettings, overrides?: Partial<PrintCostInputs>) {
    const inputs = parse(costInputsSchema, {
      ...defaultCostInputs(settings), ...await store.getPrintCostInputs(id), ...overrides,
    });
    if (overrides?.printerId != null && !settings.printers.some((printer) => printer.id === overrides.printerId)) {
      throw new ApiError(400, "validation_error", "Selected printer does not exist.");
    }
    return inputs;
  }
  function selectPlates(print: ParsedPrint, selection?: number | "all"): ParsedPlate[] {
    const plates = print.plates ?? [print.plate];
    if (selection === "all") return plates;
    if (selection === undefined) return [print.plate];
    const plate = plates.find((item, index) => (item.plateIndex ?? index + 1) === selection);
    if (!plate) throw new ApiError(404, "not_found", "Plate not found.");
    return [plate];
  }
  function cost(plates: ParsedPlate[], settings: AppSettings, inputs: PrintCostInputs) {
    return plates.length > 1 ? calculateAllPlatesCost(plates, settings, inputs) : calculateCost(plates[0], settings, inputs);
  }
  function manualPlate(body: z.output<typeof manualSchema>): ParsedPlate {
    const filaments = parseManualFilaments(JSON.stringify(body.filaments));
    const categories = filaments && parseManualCategories(
      body.categoryByFilament === undefined ? null : JSON.stringify(body.categoryByFilament), filaments,
    );
    if (!filaments || !categories) {
      throw new ApiError(400, "validation_error", "Filament IDs must be unique, weight positive, and category weights must match filament weights.");
    }
    return {
      ...manualBreakdown(body.name, filaments, categories), filaments,
      printTimeSeconds: body.minutes * 60, totalPrintTimeSeconds: body.minutes * 60,
      layerCount: 0, nozzleDiameterMm: null, printerModelId: null, bedType: null, thumbnailBase64: null,
    };
  }

  addRead({
    method: "GET", path: "/prints", operationId: "listPrints", tag: "Prints", summary: "List saved prints",
    query: listQuerySchema,
    responses: { 200: { description: "Prints in storage order, with pagination", schema: z.object({
      prints: z.array(printSchema), total: z.number(), limit: z.number(), offset: z.number(),
    }) } },
    async handler(request) {
      const { limit, offset } = parse(listQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      const prints = await store.listPrints();
      return json({ prints: prints.slice(offset, offset + limit), total: prints.length, limit, offset });
    },
  });
  add({
    method: "POST", path: "/prints", operationId: "createManualPrint", tag: "Prints",
    summary: "Create a manual print", body: manualSchema,
    responses: { 201: { description: "Created", schema: z.object({ print: printSchema }) } },
    async handler(_request, _params, body) {
      const print: ParsedPrint = {
        id: crypto.randomUUID(), fileName: body.name, displayName: body.name, manual: true,
        createdAt: new Date().toISOString(), plate: manualPlate(body),
      };
      await store.insertPrint(print);
      const response = json({ print }, 201);
      response.headers.set("Location", `/api/v1/prints/${print.id}`);
      return response;
    },
  });
  operations.push({
    method: "POST", path: "/prints/upload", operationId: "uploadPrint", tag: "Prints", summary: "Upload a sliced 3MF archive",
    description: "Multipart upload, at most 100 MiB including multipart overhead. 3D previews run in the existing background queue.",
    body: z.strictObject({ file: z.string().meta({ format: "binary" }), displayName: z.string().max(200).optional() }),
    mediaType: "multipart/form-data", responses: { 201: { description: "Created", schema: z.object({ print: printSchema }) } },
    async execute(request) {
      if (new URL(request.url).searchParams.size) throw new ApiError(400, "validation_error", "Unexpected query parameters.");
      if (!/^multipart\/form-data;/i.test(request.headers.get("content-type") ?? "")) {
        throw new ApiError(415, "unsupported_media_type", "Use multipart/form-data.");
      }
      const bytes = await readBody(request, 100 * 1024 * 1024);
      let form: FormData;
      try {
        form = await new Response(Buffer.from(bytes), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
      } catch {
        throw new ApiError(400, "validation_error", "Invalid multipart body.");
      }
      const file = form.get("file");
      const displayName = form.get("displayName");
      if ([...form.keys()].some((key) => !["file", "displayName"].includes(key)) ||
        form.getAll("file").length !== 1 || form.getAll("displayName").length > 1 ||
        !(file instanceof File) || file.size === 0 || !file.name.toLowerCase().endsWith(".3mf") ||
        (displayName !== null && (typeof displayName !== "string" || displayName.length > 200))) {
        throw new ApiError(400, "validation_error", "Provide one non-empty .3mf file and an optional displayName (max 200 characters).");
      }
      const response = await fromInternal(await dependencies.upload(new Request(request.url, { method: "POST", body: form })));
      const body: { print: ParsedPrint } = await response.clone().json();
      response.headers.set("Location", `/api/v1/prints/${body.print.id}`);
      return response;
    },
  });
  addRead({
    method: "GET", path: "/prints/{id}", operationId: "getPrint", tag: "Prints", summary: "Read a print and effective cost inputs",
    pathSchema: printPath,
    responses: { 200: { description: "Print details; defaults are merged into older saved inputs", schema: z.object({
      print: printSchema, costInputs: costInputsSchema,
    }) } },
    async handler(_request, { id }) {
      const print = await requirePrint(id);
      const settings = await store.getSettings();
      return json({ print, costInputs: await effectiveInputs(id, settings) });
    },
  });
  add({
    method: "PATCH", path: "/prints/{id}", operationId: "renamePrint", tag: "Prints",
    summary: "Rename a print", pathSchema: printPath, body: renameSchema, responses: ok,
    async handler(_request, { id }, body) {
      const print = await requirePrint(id);
      if (print.manual) {
        await store.savePrint({ ...print, displayName: body.displayName, plate: { ...print.plate,
          objects: print.plate.objects.map((object) => ({ ...object, name: body.displayName })) } });
      } else await store.updatePrintName(id, body.displayName);
      return json({ ok: true });
    },
  });
  add({
    method: "PUT", path: "/prints/{id}/manual", operationId: "updateManualPrint", tag: "Prints",
    summary: "Replace manual print measurements", pathSchema: printPath, body: manualSchema, responses: ok,
    async handler(_request, { id }, body) {
      const print = await requirePrint(id);
      if (!print.manual) throw new ApiError(409, "conflict", "Only manually created prints can be replaced here.");
      await store.savePrint({ ...print, displayName: body.name, plate: {
        ...manualPlate(body), thumbnailBase64: print.plate.thumbnailBase64,
      } });
      return json({ ok: true });
    },
  });
  addRead({
    method: "DELETE", path: "/prints/{id}", operationId: "deletePrint", tag: "Prints",
    summary: "Delete a print and cancel its preview", pathSchema: printPath, responses: ok,
    async handler(_request, { id }) {
      await requirePrint(id);
      if ((await store.listOrders()).some((order) => order.items.some((item) => item.printId === id))) {
        throw new ApiError(409, "conflict", "Prints linked to an order cannot be deleted.");
      }
      await dependencies.cancelPreview(id);
      try {
        await store.deletePrint(id);
      } catch (error) {
        if (isPrintLinkedToOrderError(error)) {
          throw new ApiError(409, "conflict", "Prints linked to an order cannot be deleted.");
        }
        throw error;
      }
      return json({ ok: true });
    },
  });
  add({
    method: "PUT", path: "/prints/{id}/cost-inputs", operationId: "saveCostInputs", tag: "Costs",
    summary: "Update and persist cost inputs", pathSchema: printPath, body: costInputsPatchSchema,
    description: "Omitted fields retain saved values or defaults. Maps and arrays replace the corresponding saved field.",
    responses: { 200: { description: "Saved effective inputs", schema: z.object({ costInputs: costInputsSchema }) } },
    async handler(_request, { id }, body) {
      await requirePrint(id);
      const inputs = await effectiveInputs(id, await store.getSettings(), body);
      await store.savePrintCostInputs(id, inputs);
      return json({ costInputs: inputs });
    },
  });
  add({
    method: "POST", path: "/prints/{id}/calculate", operationId: "calculatePrint", tag: "Costs",
    summary: "Calculate costs without saving", pathSchema: printPath, body: calculationSchema,
    description: "Without plateIndex, calculate the first plate. Use 'all' for project totals. Inputs override saved values for this request only.",
    responses: { 200: { description: "Cost breakdown in the configured currency", schema: z.object({
      result: resultSchema, costInputs: costInputsSchema, currency: z.string(),
    }) } },
    async handler(_request, { id }, body) {
      const print = await requirePrint(id);
      const settings = await store.getSettings();
      const inputs = await effectiveInputs(id, settings, body.inputs);
      return json({ result: cost(selectPlates(print, body.plateIndex), settings, inputs),
        costInputs: inputs, currency: settings.general.currency });
    },
  });
  addRead({
    method: "GET", path: "/prints/{id}/download", operationId: "downloadOriginal", tag: "Prints",
    summary: "Download the retained original 3MF archive", pathSchema: printPath,
    description: "Requires general.retainOriginalArchives. Only uploads made with retention enabled are available. Linked plate prints return the entire source archive, not a single plate.",
    responses: { 200: { description: "Original upload bytes with attachment filename",
      schema: z.string().meta({ format: "binary" }), mediaType: "application/octet-stream" } },
    async handler(_request, { id }) {
      return originalDownload(id, {
        enabled: async () => (await store.getSettings()).general.retainOriginalArchives,
        getPrint: (id) => store.getPrint(id), archives: originalArchives,
      });
    },
  });
  addRead({
    method: "GET", path: "/prints/{id}/plates", operationId: "listPlates", tag: "Prints",
    summary: "Read all plates", pathSchema: printPath,
    responses: { 200: { description: "Plate metadata", schema: z.object({ plates: z.array(plateSchema) }) } },
    async handler(_request, { id }) {
      const print = await requirePrint(id);
      return json({ plates: print.plates ?? [print.plate] });
    },
  });
  add({
    method: "PATCH", path: "/prints/{id}/plates", operationId: "renamePlate", tag: "Prints",
    summary: "Rename a print plate", pathSchema: printPath, body: plateNameSchema, responses: ok,
    description: "Changes only this print's plate name, not measurements or separately saved plate prints.",
    async handler(_request, { id }, body) {
      await store.savePrint(renamePlate(await requirePrint(id), body));
      return json({ ok: true });
    },
  });
  addRead({
    method: "POST", path: "/prints/{id}/plates", operationId: "splitPlates", tag: "Prints",
    summary: "Create individual saved prints from all plates", pathSchema: printPath,
    description: "Existing linked plate prints are not duplicated.",
    responses: { 200: { description: "All plates already exist", schema: z.object({ count: z.number() }) },
      201: { description: "Plate prints created", schema: z.object({ count: z.number() }) } },
    async handler(request, { id }) { return fromInternal(await dependencies.splitPlates(request, id)); },
  });
  addRead({
    method: "GET", path: "/prints/{id}/model", operationId: "getModel", tag: "Prints",
    summary: "Read a gzip-compressed 3D preview", pathSchema: printPath, query: plateQuerySchema,
    responses: {
      200: { description: "JSON geometry, HTTP gzip encoding", schema: z.object({
        kind: z.enum(["mesh", "toolpath"]).optional(), positions: z.array(z.number()), colors: z.array(z.string()),
        widths: z.array(z.number()).optional(), heights: z.array(z.number()).optional(),
      }) },
      202: { description: "Preview pending; Retry-After: 3 seconds", schema: z.object({ status: z.enum(["queued", "running"]) }) },
    },
    async handler(request, { id }) { return fromInternal(await dependencies.model(request, id)); },
  });
  addRead({
    method: "POST", path: "/prints/{id}/model", operationId: "retryModel", tag: "Prints",
    summary: "Retry a failed preview calculation", pathSchema: printPath,
    responses: { 202: { description: "Preview queued", schema: z.object({ status: z.literal("queued") }) } },
    async handler(request, { id }) { return fromInternal(await dependencies.retryModel(request, id)); },
  });

  addRead({
    method: "GET", path: "/settings", operationId: "getSettings", tag: "Settings", summary: "Read application settings",
    description: "Does not expose database passwords, external service keys or API keys.",
    responses: { 200: { description: "Settings", schema: z.object({ settings: settingsSchema }) } },
    async handler() { return json({ settings: await store.getSettings() }); },
  });
  add({
    method: "PUT", path: "/settings", operationId: "replaceSettings", tag: "Settings",
    summary: "Replace all application settings", body: settingsSchema,
    responses: { 200: { description: "Saved", schema: z.object({ settings: settingsSchema }) } },
    async handler(_request, _params, body) {
      return exclusiveSettings(async () => json({ settings: await persistSettings(body, _request) }));
    },
  });
  add({
    method: "PATCH", path: "/settings", operationId: "updateSettings", tag: "Settings",
    summary: "Update selected application settings", body: settingsPatchSchema,
    description: "General, costs and numbering fields merge. Collections replace entire arrays. The last save wins against UI changes; use one app instance.",
    responses: { 200: { description: "Saved", schema: z.object({ settings: settingsSchema }) } },
    async handler(_request, _params, body) {
      return exclusiveSettings(async () => {
        const current = await store.getSettings();
        return json({ settings: await persistSettings({
          ...current, ...body, general: { ...current.general, ...body.general }, costs: { ...current.costs, ...body.costs },
          numbering: {
            invoice: { ...current.numbering.invoice, ...body.numbering?.invoice },
            quote: { ...current.numbering.quote, ...body.numbering?.quote },
          },
        }, _request) });
      });
    },
  });

  function collection<T extends z.ZodType>(
    path: string, schema: T, get: (settings: AppSettings) => (z.output<T> & { id: string })[],
    set: (settings: AppSettings, items: (z.output<T> & { id: string })[]) => AppSettings,
  ) {
    const pathSchema = z.strictObject({ id: idSchema });
    const response = { 200: { description: "Resource", schema: z.object({ item: schema }) } };
    addRead({
      method: "GET", path, operationId: `list${path.replace(/\W/g, "")}`, tag: "Settings", summary: `List ${path.slice(1)}`,
      responses: { 200: { description: "Collection", schema: z.object({ items: z.array(schema) }) } },
      async handler() { return json({ items: get(await store.getSettings()) }); },
    });
    addRead({
      method: "GET", path: `${path}/{id}`, operationId: `get${path.replace(/\W/g, "")}`, tag: "Settings",
      summary: `Read ${path.slice(1)} item`, pathSchema, responses: response,
      async handler(_request, { id }) {
        const item = get(await store.getSettings()).find((item) => item.id === id);
        if (!item) throw new ApiError(404, "not_found", "Resource not found.");
        return json({ item });
      },
    });
    add({
      method: "POST", path, operationId: `create${path.replace(/\W/g, "")}`, tag: "Settings",
      summary: `Create ${path.slice(1)} item`, body: schema,
      responses: { 201: { description: "Created", schema: z.object({ item: schema }) } },
      async handler(_request, _params, body) {
        return exclusiveSettings(async () => {
          const settings = await store.getSettings();
          const item = parse(schema.and(z.object({ id: idSchema })), body);
          const items = get(settings);
          if (items.some((entry) => entry.id === item.id)) throw new ApiError(409, "conflict", "Resource ID already exists.");
          await persistSettings(set(settings, [...items, item]), _request);
          const result = json({ item }, 201);
          result.headers.set("Location", `/api/v1${path}/${encodeURIComponent(item.id)}`);
          return result;
        });
      },
    });
    add({
      method: "PUT", path: `${path}/{id}`, operationId: `replace${path.replace(/\W/g, "")}`, tag: "Settings",
      summary: `Replace ${path.slice(1)} item`, pathSchema, body: schema, responses: response,
      async handler(_request, { id }, body) {
        return exclusiveSettings(async () => {
          const settings = await store.getSettings();
          const item = parse(schema.and(z.object({ id: idSchema })), body);
          const items = get(settings);
          if (!items.some((entry) => entry.id === id)) throw new ApiError(404, "not_found", "Resource not found.");
          if (item.id !== id) throw new ApiError(400, "validation_error", "Body ID must match path ID.");
          await persistSettings(set(settings, items.map((entry) => entry.id === id ? item : entry)), _request);
          return json({ item });
        });
      },
    });
    addRead({
      method: "DELETE", path: `${path}/{id}`, operationId: `delete${path.replace(/\W/g, "")}`, tag: "Settings",
      summary: `Delete ${path.slice(1)} item`, pathSchema, responses: ok,
      async handler(_request, { id }) {
        return exclusiveSettings(async () => {
          const settings = await store.getSettings();
          const items = get(settings);
          if (!items.some((item) => item.id === id)) throw new ApiError(404, "not_found", "Resource not found.");
          if (path === "/printers" && id === settings.defaultPrinterId) {
            throw new ApiError(409, "conflict", "Select another default printer before deleting this printer.");
          }
          await persistSettings(set(settings, items.filter((item) => item.id !== id)), _request);
          return json({ ok: true });
        });
      },
    });
  }
  collection("/materials", materialSchema, (s) => s.materials, (s, items) => ({ ...s, materials: items }));
  collection("/accessory-materials", accessorySchema, (s) => s.accessoryMaterials, (s, items) => ({ ...s, accessoryMaterials: items }));
  collection("/printers", printerSchema, (s) => s.printers, (s, items) => ({ ...s, printers: items }));
  collection("/invoices/templates", templateSchema, (s) => s.invoiceTemplates, (s, items) => ({ ...s, invoiceTemplates: items }));
  collection("/quotes/templates", templateSchema, (s) => s.quoteTemplates, (s, items) => ({ ...s, quoteTemplates: items }));

  for (const kind of ["invoice", "quote"] as const) {
    const path = kind === "invoice" ? "/invoices" : "/quotes";
    add({
      method: "POST", path, operationId: `render${kind}`, tag: "Documents",
      summary: `Generate ${kind} HTML from a saved print`, body: documentSchema,
      description: "Returns printable HTML, not a PDF or saved document. documentNumber is required and numbering counters are not consumed. GET /settings provides numbering configuration.",
      responses: { 200: { description: "Downloadable HTML document", schema: z.string(), mediaType: "text/html" } },
      async handler(_request, _params, body) {
        const print = await requirePrint(body.printId);
        const settings = await store.getSettings();
        const templates = kind === "invoice" ? settings.invoiceTemplates : settings.quoteTemplates;
        const template = templates.find((template) => template.id === body.templateId);
        if (!template) throw new ApiError(404, "not_found", "Template not found.");
        const plates = selectPlates(print, body.plateIndex);
        const inputs = await effectiveInputs(print.id, settings, body.inputs);
        const result = cost(plates, settings, inputs);
        const lang = settings.general.language;
        const t = (key: string) => translate(lang, key, undefined, settings.customLanguagePacks);
        const locale = getIntlLocale(lang);
        const money = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: settings.general.currency }).format(value);
        const asDate = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC" });
        const values: Record<string, string> = {
          ...template.customValues,
          companyName: settings.general.companyName || template.customValues?.companyName || "",
          companyAddress: settings.general.companyAddress || template.customValues?.companyAddress || "",
          companyEmail: settings.general.companyEmail || template.customValues?.companyEmail || "",
          companyPhone: settings.general.companyPhone || template.customValues?.companyPhone || "",
          companyTaxId: settings.general.companyTaxId || template.customValues?.companyTaxId || "",
          companyIban: settings.general.companyIban || template.customValues?.companyIban || "",
          customerName: body.customerName, customerAddress: body.customerAddress,
          invoiceNumber: body.documentNumber, invoiceDate: asDate(body.date), dueDate: body.dueDate ? asDate(body.dueDate) : "",
          paymentTerms: body.paymentTerms ?? template.customValues?.paymentTerms ?? "",
          printName: print.displayName ?? print.fileName,
          printWeight: `${plates.reduce((sum, plate) => sum + plate.totalWeightGrams, 0).toFixed(1)} g`,
          printTime: formatDuration(plates.reduce((sum, plate) => sum + plate.totalPrintTimeSeconds, 0)),
          quantity: String(inputs.quantity), subtotal: money(result.subtotal), margin: money(result.marginAmount),
          tax: money(result.vatAmount), vatPercent: String(inputs.vatPercent), total: money(result.totalPrice),
        };
        const bases = plates.map((plate) => calculateCost(plate, settings, {
          ...inputs, energyKwhOverride: null, laborMinutes: 0, packagingCost: 0, extraCosts: [], quantity: 1,
        }).subtotal);
        const allocated = allocateInvoiceAmounts(result.totalPrice, bases);
        const defaultLabels: Record<InvoiceCostLine, string> = {
          material: t("cost.material"), extraMaterials: t("extra.title"), energy: t("cost.electricity"),
          machine: t("cost.machine"), labor: t("cost.labor"), packaging: t("cost.packaging"),
          margin: t("cost.margin"), tax: `${t("cost.tax")} ({{vatPercent}} %)`,
        };
        const html = await renderInvoiceHtml({
          template: { ...template, elements: template.elements.map((element) => ({
            ...element, lineLabels: { ...defaultLabels, ...element.lineLabels },
          })) },
          values, result, money, title: `${t(`${kind}.documentTitle`)} ${body.documentNumber}`,
          showQuantityDiscount: body.showQuantityDiscount, quantityDiscountLabel: t("cost.quantityDiscount"),
          subtotalLabel: t("cost.subtotal"),
          positionItems: (print.plates?.length ?? 1) > 1 ? plates.map((plate, index) => ({
            name: plate.plateName ?? translate(lang, "print.plateNumber", { number: plate.plateIndex ?? index + 1 }, settings.customLanguagePacks),
            quantity: inputs.quantity, unitPrice: allocated[index] / inputs.quantity, amount: allocated[index],
          })) : undefined,
          positionLabels: { item: t("invoice.positionItem"), quantity: t("invoice.positionQuantity"),
            unitPrice: t("invoice.positionUnitPrice"), total: t("invoice.positionTotal") },
        });
        return new Response(html, { headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="${body.documentNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}.html"`,
          "Content-Security-Policy": "sandbox allow-scripts; default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
        } });
      },
    });
  }
  return operations;
}
