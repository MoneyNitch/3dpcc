import { getPrintCostInputs, getSettings, listOrders, listPrints } from "@/lib/db";
import { requirePage } from "@/lib/auth/server";
import { translate } from "@/lib/i18n";
import { calculatePrintStatistics } from "@/lib/statistics";
import { requireSetupComplete } from "@/lib/setupGuard";

export const dynamic = "force-dynamic";

function formatPrintTime(seconds: number, language: string, t: (key: string) => string) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return t("stats.duration")
    .replace("{hours}", new Intl.NumberFormat(language).format(hours))
    .replace("{minutes}", new Intl.NumberFormat(language).format(minutes));
}

export default async function StatisticsPage() {
  await requirePage("documents.read");
  const [settings, orders, prints] = await Promise.all([getSettings(), listOrders(), listPrints()]);
  requireSetupComplete(settings);

  const statistics = calculatePrintStatistics(
    await Promise.all(prints.map(async (print) => ({
      print,
      costInputs: await getPrintCostInputs(print.id),
    }))),
    orders,
    settings
  );
  const lang = settings.general.language;
  const t = (key: string) => translate(lang, key, undefined, settings.customLanguagePacks);
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat(lang, {
    style: "currency",
    currency: settings.general.currency,
  });
  const maxMaterialGrams = statistics.materials[0]?.grams ?? 0;
  const cards = [
    { label: t("stats.income"), value: money.format(statistics.completedOrderValue), detail: t("stats.incomeDetail") },
    { label: t("stats.prints"), value: number.format(statistics.printCount), detail: t("stats.printsDetail") },
    { label: t("stats.printTime"), value: formatPrintTime(statistics.printTimeSeconds, lang, t), detail: t("stats.printTimeDetail") },
    { label: t("stats.material"), value: `${number.format(statistics.materialGrams)} g`, detail: t("stats.materialDetail") },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("stats.title")}</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">{t("stats.subtitle")}</p>
      </div>

      <section aria-label={t("stats.overview")} className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <article key={card.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">{card.label}</h2>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{card.value}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{card.detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("stats.materialBreakdown")}</h2>
        {statistics.materials.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t("stats.empty")}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {statistics.materials.map((material) => (
              <li key={material.type}>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{material.type}</span>
                  <span className="text-slate-600 dark:text-slate-300">{number.format(material.grams)} g</span>
                </div>
                <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-orange-500"
                    style={{ width: `${maxMaterialGrams > 0 ? (material.grams / maxMaterialGrams) * 100 : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-slate-500 dark:text-slate-400">{t("stats.note")}</p>
    </div>
  );
}
