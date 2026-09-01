import { getSettings } from "@/lib/db";
import { getDbConfigView } from "@/lib/dbConfig";
import { SettingsForm } from "@/components/SettingsForm";
import { DatabaseSettingsForm } from "@/components/DatabaseSettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();
  const dbConfig = getDbConfigView();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Einstellungen</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          Diese Werte werden als Standard für die Kostenberechnung neuer Drucke verwendet.
        </p>
      </div>
      <DatabaseSettingsForm initialConfig={dbConfig} />
      <SettingsForm initialSettings={settings} />
    </div>
  );
}
