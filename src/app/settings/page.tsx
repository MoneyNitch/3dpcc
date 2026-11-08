import { getSettings } from "@/lib/db";
import { redirect } from "next/navigation";
import { getDbConfigView } from "@/lib/dbConfig";
import { translate } from "@/lib/i18n";
import { SettingsForm, type SettingsTab } from "@/components/SettingsForm";
import { DatabaseSettingsForm } from "@/components/DatabaseSettingsForm";
import { FilamentConnectionSettings } from "@/components/FilamentConnectionSettings";
import { UserManagement } from "@/components/UserManagement";
import { BackupRestore } from "@/components/BackupRestore";
import { getFilamentConnectionsView } from "@/lib/filamentConfig";
import { authEnabled, requirePage } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/permissions";
import { getAuthStore } from "@/lib/auth/store";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const user = await requirePage("settings.read");
  const enabled = authEnabled();
  const can = (permission: Parameters<typeof hasPermission>[1]) => hasPermission(user, permission, enabled);
  const manageUsers = Boolean(enabled && user && can("users.manage"));
  const { tab } = await searchParams;
  if (tab === "accessories") redirect("/accessories");
  const initialTab: SettingsTab = tab === "software" ? "software" : tab === "users" && manageUsers ? "users" : "general";
  const settings = await getSettings();
  const lang = settings.general.language;
  const t = (key: Parameters<typeof translate>[1]) =>
    translate(lang, key, undefined, settings.customLanguagePacks);
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
      <SettingsForm
        initialSettings={settings}
        databaseSettings={can("database.manage") ? <>
          <DatabaseSettingsForm initialConfig={getDbConfigView()} />
          <BackupRestore />
        </> : null}
        filamentSettings={can("integrations.manage") ? <FilamentConnectionSettings initialConnections={getFilamentConnectionsView()} /> : null}
        userSettings={manageUsers && user ? <UserManagement initial={getAuthStore().overview()} actorId={user.id} /> : null}
        initialTab={initialTab}
      />
    </div>
  );
}
