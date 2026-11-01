import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthStore, AuthError, isAuthError, sessionSeconds } from "./store";
import { hasPermission, type Identity, type Permission } from "./permissions";

export const sessionCookieName = "pcc-session";
export function authEnabled(): boolean {
  const value = process.env.AUTH_ENABLED?.trim().toLowerCase();
  if (value === undefined || value === "" || value === "true") return true;
  if (value === "false") return false;
  throw new Error("AUTH_ENABLED must be true or false.");
}
export function cookieToken(request: Request, name = sessionCookieName): string {
  return request.headers.get("cookie")?.split(";").map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}
export async function requestIdentity(request: Request, allowApi = false): Promise<Identity | null> {
  const store = getAuthStore();
  await store.initialize();
  if (allowApi && request.headers.has("authorization")) {
    const token = /^Bearer ([A-Za-z0-9_-]{32,256})$/i.exec(request.headers.get("authorization") ?? "")?.[1];
    return token ? store.apiIdentity(token) : null;
  }
  return store.session(cookieToken(request));
}
export async function currentIdentity(): Promise<Identity | null> {
  if (!authEnabled()) return null;
  const store = getAuthStore();
  await store.initialize();
  return store.session((await cookies()).get(sessionCookieName)?.value ?? "");
}
export async function requirePage(permission?: Permission, allowChange = false): Promise<Identity | null> {
  if (!authEnabled()) return null;
  const user = await currentIdentity();
  if (!user) redirect("/login");
  if (!allowChange && (user.mustChangePassword || user.mustChangeUsername)) redirect("/account");
  if (permission && !hasPermission(user, permission)) redirect("/access-denied");
  return user;
}
export function checkOrigin(request: Request): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const target = new URL(request.url);
  const expectedOrigin = process.env.AUTH_ORIGIN
    ? new URL(process.env.AUTH_ORIGIN).origin
    : `${target.protocol}//${request.headers.get("host") ?? target.host}`;
  const fetchSite = request.headers.get("sec-fetch-site");
  // Use the Host seen by Next rather than trusting arbitrary forwarding headers.
  if ((origin && origin !== expectedOrigin) ||
      fetchSite === "cross-site" || (!origin && !request.headers.has("authorization"))) {
    throw new AuthError(403, "invalidOrigin");
  }
}
export function authErrorResponse(error: unknown): Response {
  let status = 500;
  let code = "serverError";
  if (isAuthError(error)) { status = error.status; code = error.code; }
  else if (error instanceof z.ZodError || (error instanceof Error && error.name === "ZodError") || error instanceof SyntaxError) { status = 400; code = "invalidInput"; }
  else console.error("3D-PCC authentication error:", error);
  return Response.json({ error: code }, { status, headers: { "Cache-Control": "private, no-store" } });
}
export async function authorize(request: Request, permission: Permission | Permission[], allowApi = true): Promise<Response | null> {
  try {
    if (!authEnabled()) return null;
    checkOrigin(request);
    const user = await requestIdentity(request, allowApi);
    if (!user) throw new AuthError(401, "loginRequired");
    if (user.mustChangePassword || user.mustChangeUsername) throw new AuthError(403, "changeRequired");
    const allowed = Array.isArray(permission) ? permission : [permission];
    if (!allowed.some((item) => hasPermission(user, item))) throw new AuthError(403, "forbidden");
    return null;
  } catch (error) { return authErrorResponse(error); }
}
export function setSessionCookie(response: Response, request: Request, token: string, maxAge = sessionSeconds): void {
  const secure = new URL(request.url).protocol === "https:" || process.env.AUTH_COOKIE_SECURE === "true";
  response.headers.set("Set-Cookie", `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`);
  response.headers.set("Cache-Control", "private, no-store");
}
