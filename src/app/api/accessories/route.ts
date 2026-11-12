import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authorize } from "@/lib/auth/server";
import { ApiError, readJson } from "@/lib/api/http";
import { accessorySchema } from "@/lib/api/schemas";
import { updateSettings } from "@/lib/db";
import { assignAccessoryNumbers } from "@/lib/db/shared";

const input = accessorySchema.omit({ id: true, stockQuantity: true, numericId: true });
const createInput = input.extend({ stockQuantity: accessorySchema.shape.stockQuantity });
const schema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create"), item: createInput }),
  z.strictObject({ action: z.literal("createMany"), items: z.array(createInput).min(1).max(1000) }),
  z.strictObject({ action: z.literal("update"), id: z.string().min(1).max(100), item: input, expected: input }),
  z.strictObject({ action: z.literal("delete"), id: z.string().min(1).max(100), expected: input }),
]);
const sameItem = (left: z.infer<typeof input>, right: z.infer<typeof input>) =>
  left.name === right.name && left.pricePerPack === right.pricePerPack && left.unitsPerPack === right.unitsPerPack;

export async function POST(request: Request) {
  const denied = await authorize(request, "settings.write");
  if (denied) return denied;
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, "input", "accessories.error.input");
    const data = parsed.data;
    const settings = await updateSettings((current) => {
      if (data.action === "create" || data.action === "createMany") {
        const newItems = data.action === "create" ? [data.item] : data.items;
        if (current.accessoryMaterials.length + newItems.length > 1000) throw new ApiError(400, "limit", "accessories.error.limit");
        return assignAccessoryNumbers({
          ...current,
          accessoryMaterials: [
            ...current.accessoryMaterials,
            ...newItems.map((item) => ({ ...item, id: randomUUID() })),
          ],
        });
      }
      const item = current.accessoryMaterials.find((item) => item.id === data.id);
      if (!item) throw new ApiError(404, "not_found", "accessories.error.notFound");
      if (!sameItem(item, data.expected)) throw new ApiError(409, "conflict", "accessories.error.conflict");
      if (data.action === "delete" && item.stockQuantity > 0) throw new ApiError(409, "stock", "settings.stockMustBeEmpty");
      return { ...current, accessoryMaterials: data.action === "delete"
        ? current.accessoryMaterials.filter((item) => item.id !== data.id)
        : current.accessoryMaterials.map((item) => item.id === data.id ? { ...item, ...data.item } : item) };
    });
    return Response.json({ accessories: settings.accessoryMaterials }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Could not save accessory catalog:", error);
    return Response.json({ error: "accessories.error.save" }, { status: 500 });
  }
}
