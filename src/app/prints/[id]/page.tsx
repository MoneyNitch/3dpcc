import { notFound } from "next/navigation";
import { getPrint, getPrintCostInputs, getSettings } from "@/lib/db";
import { defaultCostInputs } from "@/lib/costCalculator";
import { requireSetupComplete } from "@/lib/setupGuard";
import { CostInputsProvider } from "@/lib/costInputsContext";
import { CostCalculator } from "@/components/CostCalculator";
import { ExtraCostsCard } from "@/components/ExtraCostsCard";
import { InvoiceExport } from "@/components/InvoiceExport";
import { DeletePrintButton } from "@/components/DeletePrintButton";
import { PrintNameEditor } from "@/components/PrintNameEditor";
import { PrintDataEditor } from "@/components/PrintDataEditor";
import { categoryLabel, formatDuration, formatGrams } from "@/lib/format";
import { translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function PrintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const print = await getPrint(id);
  if (!print) notFound();

  const settings = await getSettings();
  requireSetupComplete(settings);
  const lang = settings.general.language;
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);
  // Merge over defaults so older saved cost inputs (pre-dating new fields) stay valid.
  const costInputs = { ...defaultCostInputs(settings), ...(await getPrintCostInputs(id)) };
  const { plate } = print;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <PrintNameEditor id={print.id} initialName={print.displayName ?? print.fileName} />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{print.fileName}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("print.uploadedAt")}{" "}
            {new Date(print.createdAt).toLocaleString(lang === "en" ? "en-US" : "de-DE")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PrintDataEditor id={print.id} plate={plate} />
          <DeletePrintButton id={print.id} />
        </div>
      </div>

      <CostInputsProvider printId={print.id} initialInputs={costInputs}>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-6">
          {plate.thumbnailBase64 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={plate.thumbnailBase64} alt={print.fileName} className="mx-auto max-h-80" />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label={t("print.totalWeight")} value={formatGrams(plate.totalWeightGrams)} />
            <Stat label={t("print.printTime")} value={formatDuration(plate.totalPrintTimeSeconds)} />
            <Stat label={t("print.layers")} value={String(plate.layerCount)} />
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm overflow-x-auto dark:border-slate-700 dark:bg-slate-800">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("print.weightByPart")}</h2>
            <table className="mt-3 w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 dark:text-slate-500">
                  <th className="py-1.5 font-medium">{t("print.category")}</th>
                  {plate.filaments.map((f) => (
                    <th key={f.filamentId} className="py-1.5 text-right font-medium">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <span
                          className="h-3 w-3 rounded-full border border-slate-300 dark:border-slate-600"
                          style={{ backgroundColor: f.color }}
                        />
                        {f.type}
                      </span>
                    </th>
                  ))}
                  <th className="py-1.5 text-right font-medium">{t("print.total")}</th>
                </tr>
              </thead>
              <tbody>
                {plate.categoryTotals.map((c) => (
                  <tr key={c.category} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="py-1.5 text-slate-600 dark:text-slate-300">{categoryLabel(c.category, lang)}</td>
                    {plate.filaments.map((f) => {
                      const mf = (plate.categoryByFilament ?? []).find(
                        (x) => x.filamentId === f.filamentId
                      );
                      const grams = mf?.categories.find((x) => x.category === c.category)?.grams ?? 0;
                      return (
                        <td key={f.filamentId} className="py-1.5 text-right text-slate-500 dark:text-slate-400">
                          {formatGrams(grams)}
                        </td>
                      );
                    })}
                    <td className="py-1.5 text-right font-medium dark:text-slate-100">{formatGrams(c.grams)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-300 font-semibold dark:border-slate-600 dark:text-slate-100">
                  <td className="py-1.5">{t("print.total")}</td>
                  {plate.filaments.map((f) => {
                    const mf = (plate.categoryByFilament ?? []).find(
                      (x) => x.filamentId === f.filamentId
                    );
                    return (
                      <td key={f.filamentId} className="py-1.5 text-right">
                        {formatGrams(mf?.totalGrams ?? 0)}
                      </td>
                    );
                  })}
                  <td className="py-1.5 text-right">{formatGrams(plate.totalWeightGrams)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              {t("print.weightEstimateNote")}
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("print.objectsOnPlate")}</h2>
            <div className="mt-3 flex flex-col divide-y divide-slate-100 dark:divide-slate-700">
              {plate.objects.map((obj) => (
                <div key={obj.objectId} className="py-3">
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{obj.name}</span>
                    <span className="font-medium dark:text-slate-100">{formatGrams(obj.totalGrams)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-500 dark:text-slate-400">
                    {obj.maxHeightMm !== null && (
                      <span>
                        {t("print.height")}: {obj.maxHeightMm.toFixed(2)} mm
                      </span>
                    )}
                    {obj.categories.map((c) => (
                      <span key={c.category}>
                        {categoryLabel(c.category, lang)}: {formatGrams(c.grams)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("print.filamentsColors")}</h2>
            <div className="mt-3 flex flex-col divide-y divide-slate-100 dark:divide-slate-700">
              {plate.filaments.map((f, i) => (
                <div key={i} className="flex items-center gap-3 py-2 text-sm">
                  <span
                    className="h-5 w-5 shrink-0 rounded-full border border-slate-300 dark:border-slate-600"
                    style={{ backgroundColor: f.color }}
                  />
                  <span className="flex-1 text-slate-700 dark:text-slate-200">
                    {f.type} <span className="text-slate-400 dark:text-slate-500">{f.color}</span>
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">{f.usedMetersTotal.toFixed(2)} m</span>
                  <span className="font-medium dark:text-slate-100">{formatGrams(f.usedGramsTotal)}</span>
                </div>
              ))}
            </div>
          </section>

          <ExtraCostsCard accessoryMaterials={settings.accessoryMaterials} />
        </div>

        <div>
          <CostCalculator plate={plate} settings={settings} />
          <InvoiceExport print={print} settings={settings} />
          <InvoiceExport print={print} settings={settings} kind="quote" />
        </div>
      </div>
      </CostInputsProvider>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}
