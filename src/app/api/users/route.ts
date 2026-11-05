import { z } from "zod";
import { authEnabled, authErrorResponse, authorize, requestIdentity } from "@/lib/auth/server";
import { AuthError, getAuthStore } from "@/lib/auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function actor(request: Request) {
  if (!authEnabled()) throw new AuthError(404, "disabled");
  const denied = await authorize(request, "users.manage", false);
  if (denied) return denied;
  const user = await requestIdentity(request);
  if (!user) throw new AuthError(401, "loginRequired");
  return user;
}
export async function GET(request: Request) {
  try {
    const user = await actor(request);
    if (user instanceof Response) return user;
    return Response.json(getAuthStore().overview(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return authErrorResponse(error); }
}
const actionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("saveUser"), id: z.uuid().optional(), data: z.unknown() }),
  z.strictObject({ action: z.literal("deleteUser"), id: z.uuid() }),
  z.strictObject({ action: z.literal("saveRole"), id: z.uuid().optional(), data: z.unknown() }),
  z.strictObject({ action: z.literal("deleteRole"), id: z.string().min(1).max(64) }),
  z.strictObject({ action: z.literal("createKey"), userId: z.uuid(), name: z.string().trim().min(1).max(64) }),
  z.strictObject({ action: z.literal("revokeKey"), id: z.uuid() }),
  z.strictObject({ action: z.literal("regenerateKey"), id: z.uuid() }),
  z.strictObject({ action: z.literal("savePasswordPolicy"), data: z.unknown() }),
]);
export async function POST(request: Request) {
  try {
    const user = await actor(request);
    if (user instanceof Response) return user;
    const input = actionSchema.parse(await request.json());
    const store = getAuthStore();
    let token: string | undefined;
    switch (input.action) {
      case "saveUser": await store.saveUser(user.id, input.id, input.data); break;
      case "deleteUser": store.deleteUser(user.id, input.id); break;
      case "saveRole": store.saveRole(user.id, input.id, input.data); break;
      case "deleteRole": store.deleteRole(user.id, input.id); break;
      case "createKey": token = store.createApiKey(user.id, input.userId, input.name); break;
      case "revokeKey": store.revokeApiKey(user.id, input.id); break;
      case "regenerateKey": token = store.regenerateApiKey(user.id, input.id); break;
      case "savePasswordPolicy": store.savePasswordPolicy(user.id, input.data); break;
    }
    return Response.json({ ok: true, token }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return authErrorResponse(error); }
}
