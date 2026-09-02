import { getSettings } from "@/lib/db";
import { getDbConfigView } from "@/lib/dbConfig";
import { translate } from "@/lib/i18n";
import { SettingsForm } from "@/components/SettingsForm";
import { DatabaseSettingsForm } from "@/components/DatabaseSettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();
  const dbConfig = getDbConfigView();
  const lang = settings.general.language;
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("settings.title")}</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">{t("settings.subtitle")}</p>
      </div>
      {!settings.setupCompleted && (
        <div className="rounded-xl border border-orange-300 bg-orange-50 p-5 dark:border-orange-800 dark:bg-orange-950/30">
          <h2 className="text-lg font-semibold text-orange-800 dark:text-orange-300">
            {t("settings.welcomeTitle")}
          </h2>
          <p className="mt-1 text-sm text-orange-700 dark:text-orange-400">
            {t("settings.welcomeBody")}
          </p>
        </div>
      )}
      <DatabaseSettingsForm initialConfig={dbConfig} />
      <SettingsForm initialSettings={settings} />
    </div>
  );
}
