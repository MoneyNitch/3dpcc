import { z } from "zod";
import { authorize } from "@/lib/auth/server";
import { ApiError, readJson } from "@/lib/api/http";
import { getSettings } from "@/lib/db";
import { labelTemplateSchema } from "@/lib/labelTemplates";
import { LabelError, labelPrintDocument, renderLabel } from "@/lib/labels";

const schema = z.strictObject({ accessoryId: z.string().min(1).max(100), template: labelTemplateSchema });

export async function POST(request: Request) {
  const denied = await authorize(request, "settings.read");
  if (denied) return denied;
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "labels.error.input" }, { status: 400 });
    const item = (await getSettings()).accessoryMaterials.find((item) => item.id === parsed.data.accessoryId);
    if (!item) return Response.json({ error: "accessories.error.notFound" }, { status: 404 });
    const svg = await renderLabel(parsed.data.template, item);
    return Response.json({ svg, document: labelPrintDocument(parsed.data.template, svg) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof LabelError || error instanceof ApiError) {
      return Response.json({ error: error instanceof LabelError ? error.message : "labels.error.input" }, { status: 400 });
    }
    console.error("Could not render accessory label:", error);
    return Response.json({ error: "labels.error.render" }, { status: 500 });
  }
}
