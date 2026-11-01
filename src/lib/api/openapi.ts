import { z } from "zod";
import type { Operation } from "./operations";
import { errorSchema } from "./schemas";

function schemaJson(schema: z.ZodType, io: "input" | "output" = "output") {
  const result = z.toJSONSchema(schema, { target: "draft-2020-12", io });
  delete result.$schema;
  return result;
}

export function createOpenApi(operations: Operation[]) {
  const paths: Record<string, Record<string, unknown>> = {};
  const errors: Record<number, string> = {
    400: "Invalid input or JSON", 401: "Missing or invalid API key", 403: "Feature disabled in settings",
    404: "Resource not found", 409: "Operation conflicts with current state",
    413: "Request body too large", 415: "Unsupported content type", 422: "Invalid 3MF archive",
    500: "Internal server error", 503: "API keys not configured or invalid server configuration",
  };
  for (const operation of operations) {
    const parameters: unknown[] = [];
    for (const [location, schema] of [["path", operation.pathSchema], ["query", operation.query]] as const) {
      if (!schema) continue;
      const definition = schemaJson(schema, "input");
      for (const [name, property] of Object.entries(definition.properties ?? {})) {
        parameters.push({
          name, in: location, required: location === "path" || (definition.required?.includes(name) ?? false),
          schema: property,
        });
      }
    }
    const responses: Record<string, unknown> = Object.fromEntries(Object.entries(errors).map(([status, description]) => [
      status, { description, content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
    ]));
    for (const [status, response] of Object.entries(operation.responses)) {
      responses[status] = {
        description: response.description,
        ...(response.schema ? { content: {
          [response.mediaType ?? "application/json"]: { schema: schemaJson(response.schema) },
        } } : {}),
      };
    }
    paths[operation.path] ??= {};
    paths[operation.path][operation.method.toLowerCase()] = {
      operationId: operation.operationId, tags: [operation.tag], summary: operation.summary,
      ...(operation.description ? { description: operation.description } : {}),
      ...(parameters.length ? { parameters } : {}),
      ...(operation.body ? { requestBody: {
        required: true, content: {
          [operation.mediaType ?? "application/json"]: { schema: schemaJson(operation.body, "input") },
        },
      } } : {}),
      responses,
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "3D-PCC API", version: "1.0.0",
      description: "Versioned local REST API. Configure API_KEYS on the server and send Authorization: Bearer <key>. Keys have full access. Documentation sessions do not authorize API operations. Internal UI endpoints remain separate and unauthenticated: use only on a trusted private network.",
    },
    servers: [{ url: "/api/v1", description: "Same-origin 3D-PCC instance" }],
    security: [{ ApiKey: [] }],
    tags: ["Prints", "Costs", "Settings", "Documents"].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { ApiKey: { type: "http", scheme: "bearer", description: "One server-side API_KEYS value (without the Bearer prefix)." } },
      schemas: { ApiError: schemaJson(errorSchema) },
    },
  };
}
