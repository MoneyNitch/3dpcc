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
import { ModelPreview } from "@/components/ModelPreview";
import { getIntlLocale, translate } from "@/lib/i18n";
import { PlateSelectionProvider } from "@/lib/plateSelectionContext";
import { PrintPlateSelector } from "@/components/PrintPlateSelector";
import { PrintPlateDetails } from "@/components/PrintPlateDetails";

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
  const t = (key: Parameters<typeof translate>[1]) =>
    translate(lang, key, undefined, settings.customLanguagePacks);
  // Merge over defaults so older saved cost inputs (pre-dating new fields) stay valid.
  const costInputs = { ...defaultCostInputs(settings), ...(await getPrintCostInputs(id)) };
  const plate = print.plate;

  return (
    <PlateSelectionProvider plates={print.plates ?? [print.plate]}>
      <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <PrintNameEditor id={print.id} initialName={print.displayName ?? print.fileName} />
          {!print.manual && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{print.fileName}</p>}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t(print.manual ? "manual.createdAt" : "print.uploadedAt")}{" "}
            {new Date(print.createdAt).toLocaleString(getIntlLocale(lang))}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PrintDataEditor id={print.id} plate={plate} manual={print.manual} materials={settings.materials} />
          <DeletePrintButton id={print.id} />
        </div>
      </div>
      <PrintPlateSelector printId={print.id} />

      {plate.hasGcode === false && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {t("print.gcodeMissingNote")}
        </p>
      )}

      <CostInputsProvider printId={print.id} initialInputs={costInputs}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
          {((print.plates ?? [plate]).some((item) => item.thumbnailBase64) ||
            (!print.manual && settings.general.enable3dPreview)) && (
            <ModelPreview
              key={print.id}
              printId={print.id}
              thumbnail={plate.thumbnailBase64}
              alt={print.fileName}
              allow3d={!print.manual && settings.general.enable3dPreview}
            />
          )}

          <PrintPlateDetails manual={Boolean(print.manual)} languagePacks={settings.customLanguagePacks} />

          <ExtraCostsCard accessoryMaterials={settings.accessoryMaterials} />
        </div>

        <div className="min-w-0">
          <CostCalculator settings={settings} />
          <InvoiceExport print={print} settings={settings} />
          <InvoiceExport print={print} settings={settings} kind="quote" />
        </div>
      </div>
      </CostInputsProvider>
      </div>
    </PlateSelectionProvider>
  );
}
