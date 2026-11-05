import { OrderManager } from "@/components/OrderManager";
import { authEnabled, requirePage } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/permissions";
import { getSettings, listOrders, listPrints } from "@/lib/db";
import { translate } from "@/lib/i18n";
import { requireSetupComplete } from "@/lib/setupGuard";
import { localDateKey } from "@/lib/orderFilters";

export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const user = await requirePage("documents.read");
  const [settings, orders, prints] = await Promise.all([getSettings(), listOrders(), listPrints()]);
  requireSetupComplete(settings);
  const lang = settings.general.language;
  const { edit } = await searchParams;
  const t = (key: string) => translate(lang, key, undefined, settings.customLanguagePacks);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("orders.title")}</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">{t("orders.subtitle")}</p>
      </div>
      <OrderManager
        key={edit ?? "overview"}
        initialEditingOrderId={edit}
        initialToday={localDateKey(new Date())}
        initialOrders={orders}
        prints={prints.map((print) => ({ id: print.id, name: print.displayName ?? print.fileName }))}
        canEdit={hasPermission(user, "documents.write", authEnabled())}
      />
    </div>
  );
}
