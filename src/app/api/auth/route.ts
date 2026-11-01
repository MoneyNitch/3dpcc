import { z } from "zod";
import { authEnabled, authErrorResponse, checkOrigin, cookieToken, requestIdentity, setSessionCookie } from "@/lib/auth/server";
import { AuthError, getAuthStore, passwordSchema, usernameSchema } from "@/lib/auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const enabled = authEnabled();
    return Response.json({ enabled, user: enabled ? await requestIdentity(request) : null },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return authErrorResponse(error); }
}

const actions = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("login"), username: usernameSchema, password: z.string().min(1).max(128) }),
  z.strictObject({ action: z.literal("logout") }),
  z.strictObject({ action: z.literal("change"), username: usernameSchema, oldPassword: z.string().min(1).max(128), password: passwordSchema }),
]);

export async function POST(request: Request) {
  try {
    if (!authEnabled()) throw new AuthError(404, "disabled");
    checkOrigin(request);
    const input = actions.parse(await request.json());
    const store = getAuthStore();
    await store.initialize();
    if (input.action === "login") {
      const { user, token } = await store.login(input.username, input.password);
      const response = Response.json({ ok: true, redirect: user.mustChangePassword || user.mustChangeUsername ? "/account" : "/" });
      setSessionCookie(response, request, token);
      return response;
    }
    if (input.action === "logout") {
      store.logout(cookieToken(request));
      const response = Response.json({ ok: true });
      setSessionCookie(response, request, "", 0);
      return response;
    }
    const user = await requestIdentity(request);
    if (!user) throw new AuthError(401, "loginRequired");
    const token = await store.changeCredentials(user.id, input.username, input.oldPassword, input.password);
    const response = Response.json({ ok: true, redirect: "/" });
    setSessionCookie(response, request, token);
    return response;
  } catch (error) { return authErrorResponse(error); }
}
