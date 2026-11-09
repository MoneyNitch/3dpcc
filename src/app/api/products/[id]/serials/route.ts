import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/auth/server";
import { getSettings, listOrders, updateSettings } from "@/lib/db";
import { createProductSerialBatch, ProductCatalogError } from "@/lib/productCatalog";
import type { ProductType } from "@/lib/types";

const generateForOrderSchema = z.strictObject({
  quantity: z.number().int().min(1).max(1000),
  orderId: z.uuid().optional(),
});
const assignmentSchema = z.strictObject({
  serialNumber: z.string().min(1).max(50),
  orderId: z.uuid().nullable(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await authorize(request, "prints.read");
  if (denied) return denied;
  const { id } = await params;
  const product = (await getSettings()).productTypes.find((item) => item.id === id);
  if (!product) return NextResponse.json({ error: "products.error.notFound" }, { status: 404 });
  return NextResponse.json({ serialNumbers: product.serialNumbers });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await authorize(request, "prints.write");
  if (denied) return denied;
  const { id } = await params;
  let quantity: number;
  let orderId: string | undefined;
  try {
    const body = generateForOrderSchema.parse(await request.json());
    quantity = body.quantity;
    orderId = body.orderId;
  } catch {
    return NextResponse.json({ error: "products.error.quantity" }, { status: 400 });
  }
  if (orderId) {
    const orderDenied = await authorize(request, "documents.write");
    if (orderDenied) return orderDenied;
  }

  try {
    const targetOrder = orderId ? (await listOrders()).find((order) => order.id === orderId) : null;
    if (orderId && !targetOrder) {
      throw new ProductCatalogError("products.error.orderNotFound", 404);
    }
    let serials: string[] = [];
    let updatedProduct: ProductType | null = null;
    await updateSettings((settings) => {
      const index = settings.productTypes.findIndex((item) => item.id === id);
      if (index < 0) throw new ProductCatalogError("products.error.notFound", 404);
      const product = settings.productTypes[index];
      const orderLine = targetOrder?.items.find((item) => item.printId === product.linkedPrintId);
      if (targetOrder && (!product.linkedPrintId || !orderLine)) {
        throw new ProductCatalogError("products.error.orderProductMismatch", 400);
      }
      const assignedCount = orderId
        ? product.serialNumbers.filter((serial) => serial.orderId === orderId).length
        : 0;
      if (orderLine && assignedCount + quantity > orderLine.quantity) {
        throw new ProductCatalogError("products.error.orderQuantityLimit", 409);
      }
      const batch = createProductSerialBatch(product, quantity);
      serials = batch.serials;
      const productTypes = [...settings.productTypes];
      updatedProduct = {
        ...product,
        nextNumber: batch.nextNumber,
        serialNumbers: [...product.serialNumbers, ...batch.serials.map((serialNumber) => ({
          serialNumber,
          orderId: orderId ?? null,
        }))],
      };
      productTypes[index] = updatedProduct;
      return { ...settings, productTypes };
    });
    return NextResponse.json({ serials, productType: updatedProduct });
  } catch (error) {
    if (error instanceof ProductCatalogError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await authorize(request, "prints.write");
  if (denied) return denied;
  const orderDenied = await authorize(request, "documents.write");
  if (orderDenied) return orderDenied;
  const { id } = await params;
  const parsed = assignmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "products.error.assignment" }, { status: 400 });
  const { serialNumber, orderId } = parsed.data;
  const [settings, orders] = await Promise.all([getSettings(), listOrders()]);
  const product = settings.productTypes.find((item) => item.id === id);
  if (!product) return NextResponse.json({ error: "products.error.notFound" }, { status: 404 });
  if (!product.serialNumbers.some((item) => item.serialNumber === serialNumber)) {
    return NextResponse.json({ error: "products.error.serialNotFound" }, { status: 404 });
  }
  const targetOrder = orderId ? orders.find((order) => order.id === orderId) : null;
  if (orderId && !targetOrder) {
    return NextResponse.json({ error: "products.error.orderNotFound" }, { status: 404 });
  }
  if (orderId && (!product.linkedPrintId ||
    !targetOrder?.items.some((item) => item.printId === product.linkedPrintId))) {
    return NextResponse.json({ error: "products.error.orderProductMismatch" }, { status: 400 });
  }
  const quantity = targetOrder?.items.find((item) => item.printId === product.linkedPrintId)?.quantity ?? 0;
  const assignedCount = product.serialNumbers.filter((item) =>
    item.orderId === orderId && item.serialNumber !== serialNumber).length;
  if (targetOrder && assignedCount >= quantity) {
    return NextResponse.json({ error: "products.error.orderQuantityLimit" }, { status: 409 });
  }

  let notFound = false;
  let conflict = false;
  await updateSettings((current) => {
    const index = current.productTypes.findIndex((item) => item.id === id);
    if (index < 0) {
      notFound = true;
      return current;
    }
    const currentProduct = current.productTypes[index];
    if (!currentProduct.serialNumbers.some((item) => item.serialNumber === serialNumber)) {
      notFound = true;
      return current;
    }
    const currentAssignedCount = currentProduct.serialNumbers.filter((item) =>
      item.orderId === orderId && item.serialNumber !== serialNumber).length;
    if (targetOrder && currentAssignedCount >= quantity) {
      conflict = true;
      return current;
    }
    const productTypes = [...current.productTypes];
    productTypes[index] = {
      ...currentProduct,
      serialNumbers: currentProduct.serialNumbers.map((item) =>
        item.serialNumber === serialNumber ? { ...item, orderId } : item),
    };
    return { ...current, productTypes };
  });
  if (notFound) return NextResponse.json({ error: "products.error.serialNotFound" }, { status: 404 });
  if (conflict) return NextResponse.json({ error: "products.error.orderQuantityLimit" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
