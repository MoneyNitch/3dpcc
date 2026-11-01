import Link from "next/link";
import { requirePage } from "@/lib/auth/server";
import { getSettings } from "@/lib/db";
import { translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export default async function AccessDeniedPage() {
  await requirePage();
  const settings = await getSettings();
  const t = (key: string) => translate(settings.general.language, key, undefined, settings.customLanguagePacks);
  return <div><h1 className="text-2xl font-semibold">{t("auth.accessDenied")}</h1><p className="my-4">{t("auth.error.forbidden")}</p><Link href="/account" className="text-orange-600">{t("auth.account")}</Link></div>;
}
