import { z } from "zod";
import { authorize } from "@/lib/auth/server";
import { ApiError, readJson } from "@/lib/api/http";
import { labelTemplatesSchema } from "@/lib/labelTemplates";
import { updateSettings } from "@/lib/db";

const schema = z.strictObject({ templates: labelTemplatesSchema, expected: labelTemplatesSchema });

export async function PUT(request: Request) {
  const denied = await authorize(request, "settings.write");
  if (denied) return denied;
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, "input", "labels.error.input");
    const settings = await updateSettings((current) => {
      if (JSON.stringify(current.labelTemplates) !== JSON.stringify(parsed.data.expected)) {
        throw new ApiError(409, "conflict", "labels.error.conflict");
      }
      return { ...current, labelTemplates: parsed.data.templates };
    });
    return Response.json({ templates: settings.labelTemplates }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Could not save label templates:", error);
    return Response.json({ error: "labels.error.save" }, { status: 500 });
  }
}
