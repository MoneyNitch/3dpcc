import Link from "next/link";
import type { Language, LanguagePack, ParsedPrint } from "@/lib/types";
import { formatDuration, formatGrams } from "@/lib/format";
import { translate } from "@/lib/i18n";

export function PrintCard({
  print,
  lang,
  languagePacks,
}: {
  print: ParsedPrint;
  lang: Language;
  languagePacks: LanguagePack[];
}) {
  const { plate } = print;
  const plates = print.plates ?? [plate];
  return (
    <Link
      href={`/prints/${print.id}`}
      className="group flex gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-700">
        {plate.thumbnailBase64 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={plate.thumbnailBase64} alt={print.fileName} className="h-full w-full object-cover" />
        ) : (
          <span className="text-2xl">🖨️</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-800 group-hover:text-orange-600 dark:text-slate-100">
          {print.displayName ?? print.fileName}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
          <span>⚖️ {formatGrams(plates.reduce((total, item) => total + item.totalWeightGrams, 0))}</span>
          <span>⏱️ {formatDuration(plates.reduce((total, item) => total + item.totalPrintTimeSeconds, 0))}</span>
          {plates.length > 1 && <span>{translate(lang, "print.plateCount", { count: plates.length }, languagePacks)}</span>}
          <span>🎨 {plate.filaments.length} {translate(lang, "printCard.filaments", undefined, languagePacks)}</span>
        </div>
        <div className="mt-2 flex gap-1">
          {plate.filaments.map((f, i) => (
            <span
              key={i}
              className="h-4 w-4 rounded-full border border-slate-300 dark:border-slate-600"
              style={{ backgroundColor: f.color }}
              title={`${f.type} ${f.color}`}
            />
          ))}
        </div>
      </div>
    </Link>
  );
}
