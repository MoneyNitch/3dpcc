import { ProductsManager } from "@/components/ProductsManager";
import { authEnabled, requirePage } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/permissions";
import { getSettings, listOrders, listPrints } from "@/lib/db";
import { translate } from "@/lib/i18n";
import { requireFeatureEnabled } from "@/lib/setupGuard";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const user = await requirePage("prints.read");
  const canReadOrders = hasPermission(user, "documents.read", authEnabled());
  const settings = await getSettings();
  requireFeatureEnabled(settings, "products");
  const [prints, orders] = await Promise.all([
    listPrints(),
    settings.features.orders && canReadOrders ? listOrders() : Promise.resolve([]),
  ]);
  const linkedPrintIds = new Set(settings.productTypes.flatMap((product) =>
    product.linkedPrintId ? [product.linkedPrintId] : []));
  const lang = settings.general.language;
  const t = (key: string) => translate(lang, key, undefined, settings.customLanguagePacks);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("products.title")}</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">{t("products.subtitle")}</p>
      </header>
      <ProductsManager
        initialProductTypes={settings.productTypes}
        prints={prints.map((print) => ({
          id: print.id,
          name: print.displayName ?? print.fileName,
          thumbnailBase64: (print.plates ?? [print.plate])
            .find((plate) => plate.thumbnailBase64)?.thumbnailBase64 ?? null,
        }))}
        orders={orders.filter((order) => order.items.some((item) => linkedPrintIds.has(item.printId))).map((order) => ({
          id: order.id,
          customerName: order.customerName,
          createdAt: order.createdAt,
          deliveredAt: order.deliveredAt ?? null,
          items: order.items,
        }))}
        canAssignOrders={settings.features.orders && canReadOrders && hasPermission(user, "prints.write", authEnabled()) &&
          hasPermission(user, "documents.write", authEnabled())}
        canEdit={hasPermission(user, "prints.write", authEnabled())}
      />
    </div>
  );
}
