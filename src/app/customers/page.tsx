import { CustomerManager } from "@/components/CustomerManager";
import { authEnabled, requirePage } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/permissions";
import { getSettings, listCustomers, listOrders } from "@/lib/db";
import { translate } from "@/lib/i18n";
import { requireFeatureEnabled, requireSetupComplete } from "@/lib/setupGuard";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const user = await requirePage("documents.read");
  const settings = await getSettings();
  requireFeatureEnabled(settings, "customers");
  requireSetupComplete(settings);
  const [customers, orders] = await Promise.all([listCustomers(), listOrders()]);
  const t = (key: string) => translate(settings.general.language, key, undefined, settings.customLanguagePacks);
  return <div className="flex flex-col gap-6">
    <div><h1 className="text-2xl font-semibold">{t("customers.title")}</h1>
      <p className="mt-1 text-slate-500 dark:text-slate-400">{t("customers.subtitle")}</p></div>
    <CustomerManager initialCustomers={customers}
      orders={orders.map(({ id, customerId, status, createdAt }) => ({ id, customerId, status, createdAt }))}
      canEdit={hasPermission(user, "documents.write", authEnabled())} />
  </div>;
}
