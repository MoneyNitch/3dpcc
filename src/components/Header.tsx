import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { translate } from "@/lib/i18n";
import { getSettings } from "@/lib/db";
import { getTheme } from "@/lib/theme";
import { authEnabled, currentIdentity } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/permissions";
import { UserMenu } from "./UserMenu";

export async function Header() {
  const settings = await getSettings();
  const theme = await getTheme();
  const lang = settings.general.language;
  const enabled = authEnabled();
  const user = await currentIdentity();
  const ready = !enabled || Boolean(user && !user.mustChangePassword && !user.mustChangeUsername);
  const can = (permission: Parameters<typeof hasPermission>[1]) => ready && hasPermission(user, permission, enabled);
  const t = (key: string) => translate(lang, key, undefined, settings.customLanguagePacks);
  const canUseApi = enabled ? can("api.use") : Boolean(process.env.API_KEYS?.trim());
  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-semibold text-slate-900 dark:text-slate-100">3D-PCC</Link>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
          {can("prints.read") && <Link href="/">{t("nav.prints")}</Link>}
          {can("prints.read") && <Link href="/products">{t("nav.products")}</Link>}
          {can("documents.read") && <Link href="/invoices">{t("nav.invoices")}</Link>}
          {can("documents.read") && <Link href="/quotes">{t("nav.quotes")}</Link>}
          {can("documents.read") && <Link href="/orders">{t("nav.orders")}</Link>}
          {can("documents.read") && <Link href="/customers">{t("customers.title")}</Link>}
          {can("settings.read") && <Link href="/accessories">{t("settings.accessoryMaterials")}</Link>}
          {enabled && user ? (
            <UserMenu
              username={user.username}
              showSettings={can("settings.read")}
              showStatistics={can("documents.read")}
              showApi={Boolean(canUseApi)}
            />
          ) : (
            <>
              {can("documents.read") && <Link href="/statistics">{t("nav.statistics")}</Link>}
              {can("settings.read") && <Link href="/settings">{t("nav.settings")}</Link>}
              {canUseApi && (
                <Link href="/api/v1/docs" prefetch={false} target="_blank" rel="noopener noreferrer">
                  {translate(lang, "nav.api", undefined, settings.customLanguagePacks)}
                </Link>
              )}
            </>
          )}
          <ThemeToggle initialTheme={theme} />
        </nav>
      </div>
    </header>
  );
}
