import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const sessionSeconds = 3600;
export const docsCookieName = "pcc-api-docs";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function configuredKeys(value = process.env.API_KEYS): string[] {
  if (!value?.trim()) return [];
  const keys = value.split(",").map((key) => key.trim());
  if (keys.some((key) => !/^[A-Za-z0-9_-]{32,256}$/.test(key))) {
    throw new Error("API_KEYS must contain comma-separated keys of 32-256 URL-safe characters.");
  }
  return [...new Set(keys)];
}

export function bearerKey(request: Request, keys: string[]): string | undefined {
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return undefined;
  const candidate = digest(match[1]);
  return keys.find((key) => timingSafeEqual(candidate, digest(key)));
}

export function docsCookie(request: Request, value: string, maxAge = sessionSeconds): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${docsCookieName}=${value}; Path=/api/v1/docs; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function createDocsSession(key: string, now = Date.now()): string {
  const payload = `${Math.floor(now / 1000) + sessionSeconds}.${digest(key).toString("hex")}`;
  return `${payload}.${createHmac("sha256", key).update(payload).digest("hex")}`;
}

export function validDocsSession(request: Request, keys: string[], now = Date.now()): boolean {
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${docsCookieName}=`))?.slice(docsCookieName.length + 1);
  const match = /^(\d{10})\.([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(cookie ?? "");
  if (!match) return false;
  const expires = Number(match[1]);
  if (expires <= Math.floor(now / 1000) || expires > Math.floor(now / 1000) + sessionSeconds) return false;
  const payload = `${match[1]}.${match[2]}`;
  return keys.some((key) =>
    timingSafeEqual(Buffer.from(match[2], "hex"), digest(key)) &&
    timingSafeEqual(Buffer.from(match[3], "hex"), createHmac("sha256", key).update(payload).digest())
  );
}
