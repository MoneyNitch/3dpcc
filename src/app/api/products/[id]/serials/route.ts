import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/auth/server";
import { updateSettings } from "@/lib/db";
import { createProductSerialBatch, ProductCatalogError } from "@/lib/productCatalog";

const requestSchema = z.strictObject({ quantity: z.number().int().min(1).max(1000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await authorize(request, "prints.write");
  if (denied) return denied;
  const { id } = await params;
  let quantity: number;
  try {
    const body = requestSchema.parse(await request.json());
    quantity = body.quantity;
  } catch {
    return NextResponse.json({ error: "products.error.quantity" }, { status: 400 });
  }

  try {
    let serials: string[] = [];
    await updateSettings((settings) => {
      const index = settings.productTypes.findIndex((item) => item.id === id);
      if (index < 0) throw new ProductCatalogError("products.error.notFound", 404);
      const product = settings.productTypes[index];
      const batch = createProductSerialBatch(product, quantity);
      serials = batch.serials;
      const productTypes = [...settings.productTypes];
      productTypes[index] = { ...product, nextNumber: batch.nextNumber };
      return { ...settings, productTypes };
    });
    return NextResponse.json({ serials });
  } catch (error) {
    if (error instanceof ProductCatalogError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
