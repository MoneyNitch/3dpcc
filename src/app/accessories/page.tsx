import { AccessoryWorkspace } from "@/components/AccessoryWorkspace";
import { authEnabled, requirePage } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/permissions";
import { getSettings, listAccessoryStockMovements } from "@/lib/db";
import { translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function AccessoriesPage() {
  const user = await requirePage("settings.read");
  const [settings, movements] = await Promise.all([getSettings(), listAccessoryStockMovements()]);
  const t = (key: string) => translate(settings.general.language, key, undefined, settings.customLanguagePacks);
  return <div className="flex flex-col gap-6">
    <div><h1 className="text-2xl font-semibold">{t("settings.accessoryMaterials")}</h1><p className="mt-1 text-slate-500 dark:text-slate-400">{t("accessories.subtitle")}</p></div>
    <AccessoryWorkspace initialItems={settings.accessoryMaterials} initialMovements={movements.slice(0, 200)}
      templates={settings.labelTemplates} canEdit={hasPermission(user, "settings.write", authEnabled())} />
  </div>;
}
