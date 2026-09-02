import { getSettings, listPrints } from "@/lib/db";
import { requireSetupComplete } from "@/lib/setupGuard";
import { translate } from "@/lib/i18n";
import { UploadForm } from "@/components/UploadForm";
import { PrintCard } from "@/components/PrintCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const settings = await getSettings();
  requireSetupComplete(settings);
  const lang = settings.general.language;
  const prints = await listPrints();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {translate(lang, "dashboard.title")}
        </h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          {translate(lang, "dashboard.subtitle")}
        </p>
      </div>

      <UploadForm />

      {prints.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 dark:border-slate-700 dark:text-slate-500">
          {translate(lang, "dashboard.empty")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {prints.map((print) => (
            <PrintCard key={print.id} print={print} lang={lang} />
          ))}
        </div>
      )}
    </div>
  );
}

