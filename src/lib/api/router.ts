import { bearerKey, configuredKeys } from "./auth";
import { ApiError, errorResponse, privateResponse } from "./http";
import type { Operation } from "./operations";
import { authEnabled, requestIdentity } from "../auth/server";
import { apiPermission, hasPermission, type Permission } from "../auth/permissions";

export async function dispatchApi(
  request: Request, parts: string[], operations: Operation[],
  docs: (request: Request, parts: string[], keys: string[], operations: Operation[]) => Promise<Response>,
): Promise<Response> {
  let response: Response;
  try {
    const enabled = authEnabled();
    let keys: string[] = [];
    if (!enabled) {
      try {
        keys = configuredKeys();
      } catch (error) {
        console.error("3D-PCC API configuration error:", error);
        throw new ApiError(503, "api_not_configured", "API_KEYS configuration is invalid. Check the server logs.");
      }
      if (!keys.length) throw new ApiError(503, "api_not_configured", "Configure API_KEYS on the server to enable this API.");
    }
    if (parts[0] === "docs") {
      response = await docs(request, parts, keys, operations);
    } else {
      const user = enabled && request.headers.has("authorization") ? await requestIdentity(request, true) : null;
      if (enabled ? !user : !bearerKey(request, keys)) throw new ApiError(401, "unauthorized", "A valid API key is required.");
      const matches = operations.flatMap((operation) => {
        const segments = operation.path.slice(1).split("/");
        if (segments.length !== parts.length) return [];
        const params: Record<string, string> = {};
        for (let index = 0; index < segments.length; index++) {
          const parameter = /^\{(\w+)\}$/.exec(segments[index]);
          if (parameter) params[parameter[1]] = parts[index];
          else if (segments[index] !== parts[index]) return [];
        }
        return [{ operation, params, literalCount: segments.filter((segment) => !segment.startsWith("{")).length }];
      }).sort((a, b) => b.literalCount - a.literalCount);
      if (!matches.length) throw new ApiError(404, "not_found", "API endpoint not found.");
      const method = request.method === "HEAD" ? "GET" : request.method;
      const specific = matches.filter((match) => match.literalCount === matches[0].literalCount);
      const match = specific.find(({ operation }) => operation.method === method);
      if (!match) {
        response = errorResponse(new ApiError(405, "method_not_allowed", "Method not allowed."));
        const allowed = specific.map(({ operation }) => operation.method);
        if (allowed.includes("GET")) allowed.push("HEAD");
        response.headers.set("Allow", allowed.join(", "));
      } else {
        const allowed: Permission[] = match.operation.path === "/settings"
          ? (method === "GET" ? ["settings.read", "documents.read", "prints.read"] : ["settings.write", "documents.write"])
          : [apiPermission(match.operation.path, method)];
        if (enabled && (!allowed.some((permission) => hasPermission(user, permission)) ||
            (match.operation.tag === "Documents" && !hasPermission(user, "prints.read")))) {
          throw new ApiError(403, "forbidden", "Your role does not permit this operation.");
        }
        response = await match.operation.execute(request, match.params);
      }
    }
    response = privateResponse(response);
  } catch (error) {
    response = errorResponse(error);
  }
  return request.method === "HEAD"
    ? new Response(null, { status: response.status, headers: response.headers })
    : response;
}
