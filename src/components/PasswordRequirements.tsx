"use client";

import { useLocale } from "@/lib/locale";
import { passwordCharacterRules, type PasswordPolicy } from "@/lib/auth/passwordPolicy";

export function PasswordRequirements({ policy }: { policy: PasswordPolicy }) {
  const { t } = useLocale();
  return (
    <ul className="list-inside list-disc text-sm text-slate-500 dark:text-slate-400">
      <li>{t("auth.policy.lengthHint", { min: policy.minLength })}</li>
      {passwordCharacterRules.filter((rule) => policy[rule.key]).map((rule) => (
        <li key={rule.key}>{t(`auth.policy.${rule.key}`)}</li>
      ))}
    </ul>
  );
}
