"use client";

import { createContext, useContext, useState } from "react";
import { currencySymbol, getIntlLocale, translate } from "./i18n";
import type { Currency, Language, LanguagePack } from "./types";

interface LocaleContextValue {
  lang: Language;
  currency: Currency;
  t: (key: string, vars?: Record<string, string | number>) => string;
  money: (value: number) => string;
  setLocale: (language: Language, currency: Currency, languagePacks: LanguagePack[]) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLanguage,
  initialCurrency,
  initialLanguagePacks,
  children,
}: {
  initialLanguage: Language;
  initialCurrency: Currency;
  initialLanguagePacks: LanguagePack[];
  children: React.ReactNode;
}) {
  const [lang, setLang] = useState(initialLanguage);
  const [currency, setCurrency] = useState(initialCurrency);
  const [languagePacks, setLanguagePacks] = useState(initialLanguagePacks);
  const value = {
    lang,
    currency,
    t: (key: string, vars?: Record<string, string | number>) =>
      translate(lang, key, vars, languagePacks),
    money: (value: number) =>
      new Intl.NumberFormat(getIntlLocale(lang), { style: "currency", currency }).format(value),
    setLocale: (language: Language, nextCurrency: Currency, nextLanguagePacks: LanguagePack[]) => {
      setLang(language);
      setCurrency(nextCurrency);
      setLanguagePacks(nextLanguagePacks);
    },
  };
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider");
  return context;
}

export { currencySymbol };
