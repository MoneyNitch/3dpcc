"use client";

import { createContext, useContext, useState } from "react";
import { currencySymbol, translate } from "./i18n";
import type { Currency, Language } from "./types";

interface LocaleContextValue {
  lang: Language;
  currency: Currency;
  t: (key: string, vars?: Record<string, string | number>) => string;
  money: (value: number) => string;
  setLocale: (language: Language, currency: Currency) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ initialLanguage, initialCurrency, children }: { initialLanguage: Language; initialCurrency: Currency; children: React.ReactNode }) {
  const [lang, setLang] = useState(initialLanguage);
  const [currency, setCurrency] = useState(initialCurrency);
  const value = {
    lang,
    currency,
    t: (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    money: (value: number) => new Intl.NumberFormat(lang === "de" ? "de-DE" : "en-US", { style: "currency", currency }).format(value),
    setLocale: (language: Language, nextCurrency: Currency) => { setLang(language); setCurrency(nextCurrency); },
  };
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider");
  return context;
}

export { currencySymbol };
