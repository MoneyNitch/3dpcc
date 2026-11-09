import { NextResponse } from "next/server";
import { getPrint, getSettings, updateSettings } from "@/lib/db";
import { authorize } from "@/lib/auth/server";
import { productFiles } from "@/lib/productFiles";
import { ProductCatalogError } from "@/lib/productCatalog";
import { readPrintImage } from "@/lib/printImage";
import type { ProductType } from "@/lib/types";

const maximumProductFileBytes = 100 * 1024 * 1024;
const prefixPattern = /^[A-Za-z0-9._-]{1,30}$/;

function isImageMode(value: string): value is ProductType["imageMode"] {
  return value === "print" || value === "custom" || value === "none";
}

export async function GET(request: Request) {
  const denied = await authorize(request, "prints.read");
  if (denied) return denied;
  return NextResponse.json({ productTypes: (await getSettings()).productTypes });
}

export async function POST(request: Request) {
  const denied = await authorize(request, "prints.write");
  if (denied) return denied;
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const prefix = String(form.get("prefix") ?? "").trim();
  const digits = Number(form.get("digits"));
  const file = form.get("file");
  const hasFile = file instanceof File && file.name !== "";
  const linkedPrintId = String(form.get("linkedPrintId") ?? "").trim() || null;
  const imageMode = String(form.get("imageMode") ?? "none");
  if (!name || name.length > 100 || !prefixPattern.test(prefix) ||
    !Number.isInteger(digits) || digits < 1 || digits > 12 ||
    (hasFile && (!file.name.toLowerCase().endsWith(".3mf") ||
      file.size < 1 || file.size > maximumProductFileBytes)) ||
    (linkedPrintId !== null && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(linkedPrintId)) ||
    !isImageMode(imageMode)) {
    return NextResponse.json({ error: "products.error.invalid" }, { status: 400 });
  }

  let imageBase64: string | null = null;
  try {
    if (imageMode === "custom") {
      imageBase64 = await readPrintImage(form.get("image"));
      if (!imageBase64) return NextResponse.json({ error: "products.error.imageRequired" }, { status: 400 });
    }
    if (linkedPrintId && !await getPrint(linkedPrintId)) {
      return NextResponse.json({ error: "products.error.printNotFound" }, { status: 400 });
    }
    if (imageMode === "print" && !linkedPrintId) {
      return NextResponse.json({ error: "products.error.printRequired" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "products.error.invalidImage",
    }, { status: 400 });
  }
  const id = crypto.randomUUID();
  const product: ProductType = {
    id,
    name,
    prefix,
    digits,
    nextNumber: 1,
    fileName: hasFile
      ? file.name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255)
      : "",
    linkedPrintId,
    imageMode,
    imageBase64,
    serialNumbers: [],
  };
  if (hasFile) await productFiles.save(id, Buffer.from(await file.arrayBuffer()));
  try {
    await updateSettings((settings) => {
      if (settings.productTypes.length >= 1000) {
        throw new ProductCatalogError("products.error.limit", 409);
      }
      if (settings.productTypes.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        throw new ProductCatalogError("products.error.nameConflict", 409);
      }
      if (settings.productTypes.some((item) => item.prefix.toLowerCase() === prefix.toLowerCase())) {
        throw new ProductCatalogError("products.error.prefixConflict", 409);
      }
      return { ...settings, productTypes: [...settings.productTypes, product] };
    });
  } catch (error) {
    await productFiles.remove(id);
    if (error instanceof ProductCatalogError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  return NextResponse.json({ productType: product }, { status: 201 });
}
