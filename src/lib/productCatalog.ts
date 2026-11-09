import type { ProductType } from "./types";

export class ProductCatalogError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function createProductSerialBatch(product: ProductType, quantity: number): {
  serials: string[];
  nextNumber: number;
} {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) {
    throw new ProductCatalogError("products.error.quantity", 400);
  }
  if (product.serialNumbers.length + quantity > 10_000) {
    throw new ProductCatalogError("products.error.serialLimit", 409);
  }
  const end = product.nextNumber + quantity;
  if (!Number.isSafeInteger(end) || end > 1_000_000_001) {
    throw new ProductCatalogError("products.error.numberLimit", 409);
  }
  return {
    serials: Array.from({ length: quantity }, (_, index) =>
      `${product.prefix}${String(product.nextNumber + index).padStart(product.digits, "0")}`),
    nextNumber: end,
  };
}
