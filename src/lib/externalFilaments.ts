import { z } from "zod";

export const FILAMENT_PROVIDERS = ["spoolman", "filaman"] as const;
export type FilamentProvider = (typeof FILAMENT_PROVIDERS)[number];

export interface FilamentConnection {
  url: string;
  apiKey: string;
}

export interface FilamentConnectionView {
  url: string;
  hasApiKey: boolean;
}

export type FilamentConnectionsView = Record<FilamentProvider, FilamentConnectionView>;

export const externalSpoolSchema = z.object({
  provider: z.enum(FILAMENT_PROVIDERS),
  sourceUrl: z.string().optional(),
  id: z.number().int().positive(),
  name: z.string(),
  material: z.string(),
  color: z.string().nullable(),
  remainingGrams: z.number().finite().nonnegative().nullable(),
  pricePerKg: z.number().finite().nonnegative().nullable(),
});
export type ExternalSpool = z.infer<typeof externalSpoolSchema>;

export function externalSpoolKey(spool: ExternalSpool): string {
  return `${spool.provider}:${spool.sourceUrl ?? ""}:${spool.id}`;
}

export type FilamentErrorCode = "connection" | "auth" | "response" | "limit" | "url";

export class FilamentServiceError extends Error {
  constructor(public readonly code: FilamentErrorCode) {
    super(`External filament service: ${code}`);
  }
}

export interface ExternalSpoolResult {
  provider: FilamentProvider;
  spools: ExternalSpool[];
  error?: FilamentErrorCode;
}

export function normalizeFilamentServiceUrl(input: string): string {
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    throw new FilamentServiceError("url");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new FilamentServiceError("url");
  }
  return url.toString().replace(/\/+$/, "").replace(/\/api\/v1$/, "");
}

const amount = z.number().finite().nonnegative().nullish();
const text = z.string().nullish();
const spoolmanSchema = z.object({
  id: z.number().int().positive(),
  price: amount,
  initial_weight: amount,
  remaining_weight: amount,
  archived: z.boolean().optional(),
  filament: z.object({
    name: text,
    material: text,
    color_hex: text,
    price: amount,
    weight: amount,
    vendor: z.object({ name: text }).nullish(),
  }),
});
const filamanSchema = z.object({
  id: z.number().int().positive(),
  purchase_price: amount,
  initial_total_weight_g: amount,
  empty_spool_weight_g: amount,
  remaining_weight_g: amount,
  filament: z.object({
    designation: z.string(),
    material_type: z.string(),
    price: amount,
    raw_material_weight_g: amount,
    manufacturer: z.object({ name: text }).nullish(),
    colors: z.array(z.object({
      position: z.number().optional(),
      color: z.object({ hex_code: z.string() }).nullish(),
    })).optional(),
  }),
});

function perKg(price: number | null | undefined, grams: number | null | undefined): number | null {
  if (price == null || grams == null || grams <= 0) return null;
  const result = price * 1000 / grams;
  return Number.isFinite(result) ? result : null;
}

function color(value: string | null | undefined): string | null {
  const hex = value?.replace(/^#/, "");
  return hex && /^[\da-f]{6}([\da-f]{2})?$/i.test(hex) ? `#${hex.slice(0, 6)}` : null;
}

export function parseExternalSpools(provider: FilamentProvider, value: unknown): ExternalSpool[] {
  if (provider === "spoolman") {
    const parsed = z.array(spoolmanSchema).safeParse(value);
    if (!parsed.success) throw new FilamentServiceError("response");
    return parsed.data.filter((spool) => !spool.archived).map((spool) => ({
      provider,
      id: spool.id,
      name: [spool.filament.vendor?.name, spool.filament.name].filter(Boolean).join(" ") || `#${spool.id}`,
      material: spool.filament.material ?? "",
      color: color(spool.filament.color_hex),
      remainingGrams: spool.remaining_weight ?? null,
      pricePerKg: spool.price != null
        ? perKg(spool.price, spool.initial_weight ?? spool.filament.weight)
        : perKg(spool.filament.price, spool.filament.weight),
    }));
  }
  const parsed = z.array(filamanSchema).safeParse(value);
  if (!parsed.success) throw new FilamentServiceError("response");
  return parsed.data.map((spool) => {
    const filament = spool.filament;
    const netWeight = spool.initial_total_weight_g != null && spool.empty_spool_weight_g != null
      ? spool.initial_total_weight_g - spool.empty_spool_weight_g
      : filament.raw_material_weight_g;
    return {
      provider,
      id: spool.id,
      name: [filament.manufacturer?.name, filament.designation].filter(Boolean).join(" "),
      material: filament.material_type,
      color: color(filament.colors?.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]?.color?.hex_code),
      remainingGrams: spool.remaining_weight_g ?? null,
      pricePerKg: spool.purchase_price != null
        ? perKg(spool.purchase_price, netWeight)
        : perKg(filament.price, filament.raw_material_weight_g),
    };
  });
}

async function requestJson(url: string, provider: FilamentProvider, connection: FilamentConnection): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(connection.apiKey ? {
          Authorization: `${provider === "filaman" ? "ApiKey" : "Bearer"} ${connection.apiKey}`,
        } : {}),
      },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new FilamentServiceError(response.status === 401 || response.status === 403 ? "auth" : "connection");
    }
    if (!response.body) throw new FilamentServiceError("response");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 5_000_000) {
        await reader.cancel();
        throw new FilamentServiceError("limit");
      }
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new FilamentServiceError("response");
    }
  } catch (error) {
    if (error instanceof FilamentServiceError) throw error;
    throw new FilamentServiceError("connection");
  }
}

export async function fetchExternalSpools(
  provider: FilamentProvider,
  connection: FilamentConnection,
  testOnly = false
): Promise<ExternalSpool[]> {
  const spools: ExternalSpool[] = [];
  const ids = new Set<number>();
  for (let page = 1; page <= 51; page++) {
    const query = provider === "spoolman"
      ? `/api/v1/spool?limit=200&offset=${(page - 1) * 200}&allow_archived=false`
      : `/api/v1/spools?page=${page}&page_size=200&include_archived=false`;
    const json = await requestJson(connection.url + query, provider, connection);
    const envelope = provider === "filaman"
      ? z.object({ items: z.array(z.unknown()), total: z.number().int().nonnegative() }).safeParse(json)
      : null;
    if (envelope && !envelope.success) throw new FilamentServiceError("response");
    const items = envelope?.success ? envelope.data.items : json;
    const parsed = parseExternalSpools(provider, items);
    if (spools.length + parsed.length > 10_000) throw new FilamentServiceError("limit");
    for (const spool of parsed) {
      if (ids.has(spool.id)) throw new FilamentServiceError("response");
      ids.add(spool.id);
      spools.push({ ...spool, sourceUrl: connection.url });
    }
    const count = Array.isArray(items) ? items.length : 0;
    if (testOnly || (envelope?.success
      ? page * 200 >= envelope.data.total
      : count < 200)) return spools;
    if (count === 0) throw new FilamentServiceError("response");
  }
  throw new FilamentServiceError("limit");
}
