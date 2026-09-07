import { InvoiceTemplateBuilder } from "@/components/InvoiceTemplateBuilder";
import { getSettings } from "@/lib/db";
import { translate } from "@/lib/i18n";
import { requireSetupComplete } from "@/lib/setupGuard";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const settings = await getSettings();
  requireSetupComplete(settings);
  const lang = settings.general.language;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {translate(lang, "quote.builderTitle")}
        </h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          {translate(lang, "quote.builderSubtitle")}
        </p>
      </div>
      <InvoiceTemplateBuilder
        initialSettings={settings}
        templatesKey="quoteTemplates"
        documentTitle="Angebot"
      />
    </div>
  );
}
