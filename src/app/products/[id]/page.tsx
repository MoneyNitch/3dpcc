import { notFound } from "next/navigation";
import { z } from "zod";
import { ProductsManager } from "@/components/ProductsManager";
import { authEnabled, requirePage } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/permissions";
import { getSettings, listOrders, listPrints } from "@/lib/db";
import { requireFeatureEnabled } from "@/lib/setupGuard";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("prints.read");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const canReadOrders = hasPermission(user, "documents.read", authEnabled());
  const settings = await getSettings();
  requireFeatureEnabled(settings, "products");
  const [prints, orders] = await Promise.all([
    listPrints(),
    settings.features.orders && canReadOrders ? listOrders() : Promise.resolve([]),
  ]);
  const product = settings.productTypes.find((item) => item.id === id);
  if (!product) notFound();

  return (
    <div className="flex flex-col gap-6">
      <ProductsManager
        initialProductTypes={[product]}
        prints={prints.map((print) => ({
          id: print.id,
          name: print.displayName ?? print.fileName,
          thumbnailBase64: (print.plates ?? [print.plate])
            .find((plate) => plate.thumbnailBase64)?.thumbnailBase64 ?? null,
        }))}
        orders={orders.filter((order) => order.items.some((item) => item.printId === product.linkedPrintId)).map((order) => ({
          id: order.id,
          customerName: order.customerName,
          createdAt: order.createdAt,
          deliveredAt: order.deliveredAt ?? null,
          items: order.items,
        }))}
        canAssignOrders={settings.features.orders && canReadOrders && hasPermission(user, "prints.write", authEnabled()) &&
          hasPermission(user, "documents.write", authEnabled())}
        canEdit={hasPermission(user, "prints.write", authEnabled())}
        detailView
      />
    </div>
  );
}
