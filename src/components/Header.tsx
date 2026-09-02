import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { translate } from "@/lib/i18n";
import { getSettings } from "@/lib/db";
import { getTheme } from "@/lib/theme";

export async function Header() {
  const settings = await getSettings();
  const theme = await getTheme();
  const lang = settings.general.language;
  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold text-slate-900 dark:text-slate-100">3D-PCC</Link>
        <nav className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
          <Link href="/">{translate(lang, "nav.prints")}</Link>
          <Link href="/invoices">{translate(lang, "nav.invoices")}</Link>
          <Link href="/settings">{translate(lang, "nav.settings")}</Link>
          <ThemeToggle initialTheme={theme} />
        </nav>
      </div>
    </header>
  );
}
