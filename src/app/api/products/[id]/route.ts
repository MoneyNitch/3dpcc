import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/auth/server";
import { getPrint, updateSettings } from "@/lib/db";
import { readPrintImage } from "@/lib/printImage";
import type { ProductType } from "@/lib/types";

const imageModeSchema = z.enum(["print", "custom", "none"]);
const linkedPrintSchema = z.uuid().nullable();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await authorize(request, "prints.write");
  if (denied) return denied;
  const { id } = await params;
  const isForm = request.headers.get("content-type")?.includes("multipart/form-data");
  let linkedPrintId: string | null;
  let imageMode: ProductType["imageMode"];
  let imageBase64: string | null = null;
  let hasNewImage = false;

  try {
    if (isForm) {
      const form = await request.formData();
      const linked = form.get("linkedPrintId");
      const mode = imageModeSchema.parse(form.get("imageMode"));
      linkedPrintId = linked === null || linked === "" ? null : linkedPrintSchema.parse(String(linked));
      imageMode = mode;
      const image = form.get("image");
      hasNewImage = image instanceof File && image.size > 0;
      if (mode === "custom" && hasNewImage) imageBase64 = await readPrintImage(image);
    } else {
      const body = await request.json();
      linkedPrintId = linkedPrintSchema.parse(body.linkedPrintId);
      imageMode = imageModeSchema.parse(body.imageMode);
    }
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "products.error.invalid",
    }, { status: 400 });
  }

  if (linkedPrintId && !await getPrint(linkedPrintId)) {
    return NextResponse.json({ error: "products.error.printNotFound" }, { status: 400 });
  }
  if (imageMode === "print" && !linkedPrintId) {
    return NextResponse.json({ error: "products.error.printRequired" }, { status: 400 });
  }

  let notFound = false;
  let imageRequired = false;
  let updatedProduct: ProductType | null = null;
  await updateSettings((settings) => {
    const index = settings.productTypes.findIndex((product) => product.id === id);
    if (index < 0) {
      notFound = true;
      return settings;
    }
    const current = settings.productTypes[index];
    const nextImage = imageMode === "custom"
      ? hasNewImage ? imageBase64 : current.imageMode === "custom" ? current.imageBase64 : null
      : null;
    if (imageMode === "custom" && !nextImage) {
      imageRequired = true;
      return settings;
    }
    updatedProduct = { ...current, linkedPrintId, imageMode, imageBase64: nextImage };
    const productTypes = [...settings.productTypes];
    productTypes[index] = updatedProduct;
    return { ...settings, productTypes };
  });
  if (notFound) return NextResponse.json({ error: "products.error.notFound" }, { status: 404 });
  if (imageRequired) return NextResponse.json({ error: "products.error.imageRequired" }, { status: 400 });
  return NextResponse.json({ productType: updatedProduct });
}
