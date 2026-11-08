import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { escapeHtml } from "../invoice";
import { translate } from "../i18n";
import { bearerKey, createDocsSession, docsCookie, validDocsSession } from "./auth";
import { ApiError, json } from "./http";
import type { Operation } from "./operations";
import { createOpenApi } from "./openapi";
import { authEnabled, checkOrigin, cookieToken, requestIdentity } from "../auth/server";
import { getAuthStore } from "../auth/store";

const assets: Record<string, { type: string }> = {
  "swagger-ui.css": { type: "text/css; charset=utf-8" },
  "swagger-ui-bundle.js": { type: "text/javascript; charset=utf-8" },
};
const requireModule = createRequire(path.join(process.cwd(), "package.json"));

const styles = `
:root{color-scheme:light;--bg:#f4f6fa;--surface:#fff;--text:#172033;--muted:#526079;--border:#dce3ee;--accent:#c2410c;--input:#fff;--code:#f1f5f9}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.6}
.docs-header{border-bottom:1px solid var(--border);background:var(--surface)}
.docs-header-inner{max-width:1440px;margin:0 auto;padding:36px 40px;display:flex;align-items:center;justify-content:space-between;gap:32px}
.docs-heading{max-width:850px}
.docs-eyebrow{display:block;color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.docs-title{margin:8px 0 12px;font-size:clamp(28px,4vw,40px);line-height:1.2;letter-spacing:-.035em}
.docs-description{margin:0;color:var(--muted);font-size:15px}
.docs-actions{display:flex;align-items:center;gap:12px;flex-shrink:0;flex-wrap:wrap}
.docs-button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:10px 18px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font:inherit;font-size:14px;font-weight:650;text-decoration:none;cursor:pointer}
.docs-button:hover{border-color:var(--accent);color:var(--accent)}
.docs-button-primary{background:var(--accent);border-color:var(--accent);color:#fff}
.docs-button-primary:hover{background:#9a3412;color:#fff}
.docs-shell{max-width:1440px;margin:0 auto;padding:32px 40px 64px}
.docs-notice{margin:0 0 24px;padding:14px 18px;border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:10px;background:var(--surface);color:var(--muted);font-size:14px}
.docs-login{width:calc(100% - 32px);max-width:520px;margin:10vh auto;padding:36px;border:1px solid var(--border);border-radius:20px;background:var(--surface);box-shadow:0 16px 48px #1720330a}
.docs-login-form{display:grid;gap:12px;margin-top:28px}
.docs-login-form label{font-weight:600;font-size:14px}
.docs-login-form input{width:100%;min-height:52px;padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text);font:inherit}
:focus-visible{outline:3px solid #f97316;outline-offset:3px}
.docs-error{max-width:1360px;margin:0 auto;padding:0 24px;color:#dc2626}
.docs-error:empty{display:none}
#swagger-ui .swagger-ui{font-family:inherit;color:var(--text)}
#swagger-ui .swagger-ui .wrapper{max-width:none;padding:0}
#swagger-ui .swagger-ui main{max-width:none;margin:0;padding:0}
#swagger-ui .swagger-ui .info{margin:0 0 24px}
#swagger-ui .swagger-ui .info .title{font-size:26px;color:var(--text)}
#swagger-ui .swagger-ui .info p,#swagger-ui .swagger-ui .info li{font-size:14px;color:var(--muted);line-height:1.7}
#swagger-ui .swagger-ui .scheme-container{margin:0 0 28px;padding:20px 24px;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:none}
#swagger-ui .swagger-ui .opblock-tag{margin:24px 0 16px;padding:14px 4px;font-size:23px;color:var(--text);border-bottom:1px solid var(--border)}
#swagger-ui .swagger-ui .opblock{margin:0 0 14px;border-radius:12px;box-shadow:none;overflow:hidden}
#swagger-ui .swagger-ui .opblock .opblock-summary{min-height:76px;padding:16px 20px;gap:12px;align-items:center}
#swagger-ui .swagger-ui .opblock .opblock-summary-control{gap:16px;align-items:center;min-width:0}
#swagger-ui .swagger-ui .opblock .opblock-summary-method{min-width:100px;padding:10px 16px;border-radius:7px;font-size:15px;line-height:1.4;text-shadow:none}
#swagger-ui .swagger-ui .opblock .opblock-summary-path{font-size:17px;font-weight:650;color:var(--text);max-width:none;word-break:break-word}
#swagger-ui .swagger-ui .opblock .opblock-summary-description{font-size:14px;color:var(--muted);line-height:1.5}
#swagger-ui .swagger-ui .opblock-body{padding:8px 12px 16px}
#swagger-ui .swagger-ui .opblock .opblock-section-header{padding:16px 20px;background:var(--surface);box-shadow:none}
#swagger-ui .swagger-ui .opblock .opblock-section-header h4,#swagger-ui .swagger-ui .opblock .opblock-section-header label{color:var(--text)}
#swagger-ui .swagger-ui input[type=text],#swagger-ui .swagger-ui input[type=password],#swagger-ui .swagger-ui input[type=number],#swagger-ui .swagger-ui select{min-height:46px;padding:10px 12px;font-size:15px;border:1px solid var(--border);border-radius:8px;background:var(--input);color:var(--text)}
#swagger-ui .swagger-ui textarea{min-height:240px;padding:16px;font-size:15px;line-height:1.6;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text)}
#swagger-ui .swagger-ui .btn{min-height:42px;padding:10px 20px;font-size:14px;border-radius:8px;box-shadow:none}
#swagger-ui .swagger-ui .btn:not(.authorize):not(.execute):not(.btn-done){color:var(--text);border-color:var(--muted)}
#swagger-ui .swagger-ui .btn.execute{background:#2563eb;border-color:#2563eb;color:#fff}
#swagger-ui .swagger-ui .parameters-col_description input{width:100%;max-width:520px}
#swagger-ui .swagger-ui table thead tr td,#swagger-ui .swagger-ui table thead tr th{color:var(--muted);border-color:var(--border)}
#swagger-ui .swagger-ui .parameter__name,#swagger-ui .swagger-ui .parameter__type,#swagger-ui .swagger-ui .parameter__in,#swagger-ui .swagger-ui .response-col_status,#swagger-ui .swagger-ui .response-col_links,#swagger-ui .swagger-ui .responses-inner h4,#swagger-ui .swagger-ui .responses-inner h5,#swagger-ui .swagger-ui .model-title,#swagger-ui .swagger-ui .model{color:var(--text)}
#swagger-ui .swagger-ui .opblock-description-wrapper p,#swagger-ui .swagger-ui .renderedMarkdown p,#swagger-ui .swagger-ui .renderedMarkdown li{color:var(--muted);font-size:14px}
#swagger-ui .swagger-ui .tab li,#swagger-ui .swagger-ui label,#swagger-ui .swagger-ui .servers-title{color:var(--text)}
#swagger-ui .swagger-ui .model-box,#swagger-ui .swagger-ui .model-container{background:var(--code)}
#swagger-ui .swagger-ui section.models{border-color:var(--border);border-radius:12px}
#swagger-ui .swagger-ui section.models h4{color:var(--text);border-color:var(--border)}
#swagger-ui .swagger-ui a{color:#2563eb}
#swagger-ui .swagger-ui .dialog-ux .modal-ux{width:calc(100% - 32px);max-width:640px;background:var(--surface);border:1px solid var(--border);border-radius:16px;color:var(--text)}
#swagger-ui .swagger-ui .dialog-ux .modal-ux-header{border-color:var(--border)}
#swagger-ui .swagger-ui .dialog-ux .modal-ux-header h3,#swagger-ui .swagger-ui .dialog-ux .modal-ux-content h4,#swagger-ui .swagger-ui .dialog-ux .modal-ux-content p,#swagger-ui .swagger-ui .dialog-ux .modal-ux-content label{color:var(--text)}
#swagger-ui .swagger-ui svg{fill:var(--muted)}
@media(prefers-color-scheme:dark){
 :root{color-scheme:dark;--bg:#0b1220;--surface:#111c2e;--text:#e8eef8;--muted:#a6b5cc;--border:#2b3a50;--accent:#f97316;--input:#0b1424;--code:#182438}
 #swagger-ui .swagger-ui .opblock.opblock-get{background:#60a5fa0d;border-color:#3b82f680}
 #swagger-ui .swagger-ui .opblock.opblock-post{background:#34d3990d;border-color:#10b98180}
 #swagger-ui .swagger-ui .opblock.opblock-put{background:#fbbf240d;border-color:#f59e0b80}
 #swagger-ui .swagger-ui .opblock.opblock-patch{background:#2dd4bf0d;border-color:#14b8a680}
 #swagger-ui .swagger-ui .opblock.opblock-delete{background:#fb71850d;border-color:#f43f5e80}
 #swagger-ui .swagger-ui a{color:#93c5fd}
 #swagger-ui .swagger-ui .prop-type{color:#c4b5fd}
 .docs-button-primary{color:#0b1220}
 .docs-error{color:#fca5a5}
}
@media(max-width:800px){
 .docs-header-inner{padding:28px 20px;align-items:flex-start;flex-direction:column;gap:20px}
 .docs-shell{padding:24px 20px 48px}
 #swagger-ui .swagger-ui .opblock .opblock-summary-control{flex-wrap:wrap;gap:10px}
 #swagger-ui .swagger-ui .opblock .opblock-summary-description{flex-basis:100%}
 #swagger-ui .swagger-ui .opblock .opblock-summary-path{font-size:15px;flex:1;min-width:0}
}
@media(max-width:480px){
 .docs-shell{padding:20px 12px 40px}
 .docs-login{padding:24px}
 #swagger-ui .swagger-ui .opblock .opblock-summary{padding:14px 12px;gap:6px}
 #swagger-ui .swagger-ui .opblock .opblock-summary-method{min-width:76px;padding:9px 10px;font-size:13px}
 #swagger-ui .swagger-ui .opblock-body{padding:0 4px 12px}
 #swagger-ui .swagger-ui .scheme-container{padding:16px}
 #swagger-ui .swagger-ui table{table-layout:fixed;width:100%}
 #swagger-ui .swagger-ui .parameters-col_name{width:35%}
 #swagger-ui .swagger-ui .parameters-col_description{width:65%}
 #swagger-ui .swagger-ui .response-col_status{width:48px}
 #swagger-ui .swagger-ui .response-col_links{width:50px}
 #swagger-ui .swagger-ui td,#swagger-ui .swagger-ui th{overflow-wrap:anywhere}
 #swagger-ui .swagger-ui .highlight-code{max-width:100%;overflow:auto}
}
`;

function html(request: Request, authenticated: boolean): Response {
  const lang = request.headers.get("accept-language")?.toLowerCase().startsWith("de") ? "de" : "en";
  const t = (key: string) => escapeHtml(translate(lang, key === "api.docs.loginHelp" && authEnabled() ? "auth.apiDocsHelp" : key));
  const nonce = randomBytes(18).toString("base64");
  const content = authenticated
    ? `<header class="docs-header"><div class="docs-header-inner"><div class="docs-heading"><span class="docs-eyebrow">${t("api.docs.eyebrow")}</span><h1 class="docs-title">${t("api.docs.title")}</h1><p class="docs-description">${t("api.docs.subtitle")}</p></div><nav class="docs-actions" aria-label="${t("api.docs.actions")}"><a class="docs-button" href="/api/v1/docs/openapi.json">OpenAPI JSON</a><button class="docs-button" id="logout">${t("api.docs.logout")}</button></nav></div></header><div class="docs-shell"><p class="docs-notice">${t("api.docs.authorizeHelp")}</p><div id="swagger-ui"></div></div>
<script src="/api/v1/docs/swagger-ui-bundle.js"></script><script nonce="${nonce}">
SwaggerUIBundle({
  url: "/api/v1/docs/openapi.json", dom_id: "#swagger-ui", deepLinking: true,
  persistAuthorization: false, validatorUrl: null,
  filter: true, docExpansion: "list", defaultModelsExpandDepth: -1,
  supportedSubmitMethods: ["get", "post", "put", "patch", "delete"],
  requestInterceptor: function (request) {
    const url = new URL(request.url, location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/v1/")) throw new Error("Only same-origin API requests are allowed.");
    return request;
  }
});
document.getElementById("logout").addEventListener("click", async function () {
  try {
    const response = await fetch("/api/v1/docs/logout", { method: "POST" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    location.reload();
  } catch (error) { document.getElementById("error").textContent = error.message; }
});
</script>`
    : `<main class="docs-login"><span class="docs-eyebrow">${t("api.docs.eyebrow")}</span><h1 class="docs-title">3D-PCC API</h1><p class="docs-description">${t("api.docs.loginHelp")}</p><form class="docs-login-form" id="login">
<label for="key">${t("api.docs.key")}</label><input id="key" type="password" required autocomplete="off" minlength="32" maxlength="256">
<button class="docs-button docs-button-primary" type="submit">${t("api.docs.login")}</button></form></main>
<script nonce="${nonce}">
document.getElementById("login").addEventListener("submit", async function (event) {
  event.preventDefault();
  const field = document.getElementById("key");
  try {
    const response = await fetch("/api/v1/docs", { method: "POST", headers: { Authorization: "Bearer " + field.value } });
    field.value = "";
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error.message);
    }
    location.reload();
  } catch (error) { document.getElementById("error").textContent = error.message; }
});
</script>`;
  return new Response(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>3D-PCC API</title>
${authenticated ? '<link rel="stylesheet" href="/api/v1/docs/swagger-ui.css">' : ""}
<style nonce="${nonce}">${styles}</style></head><body><p class="docs-notice" id="http-warning" role="note" hidden>${t("security.httpWarning")}</p>${content}<p class="docs-error" id="error" role="alert"></p>
<script nonce="${nonce}">document.getElementById("http-warning").hidden = location.protocol !== "http:";</script></body></html>`, {
    status: authenticated ? 200 : 401,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
      ...(!authenticated ? { "WWW-Authenticate": 'Bearer realm="3D-PCC API docs"' } : {}),
    },
  });
}

export async function handleDocs(request: Request, parts: string[], keys: string[], operations: Operation[]): Promise<Response> {
  if (new URL(request.url).searchParams.size) throw new ApiError(400, "validation_error", "Do not pass API keys or other parameters in documentation URLs.");
  const resource = parts.slice(1).join("/");
  const enabled = authEnabled();
  const key = enabled ? null : bearerKey(request, keys);
  const user = enabled && request.headers.has("authorization") ? await requestIdentity(request, true) : null;
  const store = enabled ? getAuthStore() : null;
  if (store) await store.initialize();
  const docsToken = cookieToken(request, "pcc-user-api-docs");
  const docsUser = store?.session(docsToken, Date.now(), "docs");
  const session = enabled
    ? Boolean(docsUser && !docsUser.mustChangePassword && !docsUser.mustChangeUsername && docsUser.permissions.includes("api.use"))
    : validDocsSession(request, keys);
  const authenticated = Boolean(key || user || session);
  if (resource === "" && request.method === "POST") {
    if (!key && !user) throw new ApiError(401, "unauthorized", "A valid API key is required.");
    if (enabled) checkOrigin(request);
    const response = json({ ok: true });
    response.headers.set("Set-Cookie", enabled && store && user
      ? userDocsCookie(request, store.newSession(user.id, "docs"))
      : docsCookie(request, createDocsSession(key!)));
    return response;
  }
  if (resource === "logout" && request.method === "POST") {
    if (!authenticated) throw new ApiError(401, "unauthorized", "A valid documentation session or API key is required.");
    const response = json({ ok: true });
    if (enabled) { checkOrigin(request); store?.logout(docsToken); }
    response.headers.set("Set-Cookie", enabled ? userDocsCookie(request, "", 0) : docsCookie(request, "", 0));
    return response;
  }

  function userDocsCookie(request: Request, token: string, maxAge = 3600): string {
    const secure = new URL(request.url).protocol === "https:" || process.env.AUTH_COOKIE_SECURE === "true" ? "; Secure" : "";
    return `pcc-user-api-docs=${token}; Path=/api/v1/docs; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new ApiError(405, "method_not_allowed", "Method not allowed.");
  }
  if (resource === "") return html(request, authenticated);
  if (!authenticated) throw new ApiError(401, "unauthorized", "A valid documentation session or API key is required.");
  if (resource === "openapi.json") return json(createOpenApi(operations));
  const asset = Object.hasOwn(assets, resource) ? assets[resource] : undefined;
  if (!asset) throw new ApiError(404, "not_found", "Documentation resource not found.");
  const file = path.join(path.dirname(requireModule.resolve("swagger-ui-dist/package.json")), resource);
  return new Response(new Uint8Array(await readFile(file)), { headers: { "Content-Type": asset.type } });
}
