export const CURRENCY_CODES = [
  "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN",
  "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL",
  "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CLP", "CNY",
  "COP", "CRC", "CUC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD",
  "EGP", "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL", "GHS", "GIP",
  "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HRK", "HTG", "HUF", "IDR",
  "ILS", "INR", "IQD", "IRR", "ISK", "JMD", "JOD", "JPY", "KES", "KGS",
  "KHR", "KMF", "KPW", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR",
  "LRD", "LSL", "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP",
  "MRU", "MUR", "MVR", "MWK", "MXN", "MYR", "MZN", "NAD", "NGN", "NIO",
  "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN",
  "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG",
  "SEK", "SGD", "SHP", "SLE", "SLL", "SOS", "SRD", "SSP", "STN", "SVC",
  "SYP", "SZL", "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD",
  "TZS", "UAH", "UGX", "USD", "UYU", "UZS", "VES", "VND", "VUV", "WST",
  "XAF", "XCD", "XCG", "XDR", "XOF", "XPF", "XSU", "YER", "ZAR", "ZMW",
  "ZWG", "ZWL",
] as const;

export type Currency = (typeof CURRENCY_CODES)[number];

export function isCurrencyCode(value: unknown): value is Currency {
  return typeof value === "string" && CURRENCY_CODES.includes(value as Currency);
}

const currencyOptionsCache = new Map<string, { code: Currency; name: string }[]>();

function getIntlLocale(language: string): string {
  return language === "de" ? "de-DE" : language === "en" ? "en-US" : language;
}

export function getCurrencyOptions(language: string): { code: Currency; name: string }[] {
  const cached = currencyOptionsCache.get(language);
  if (cached) return cached;
  const locale = getIntlLocale(language);
  const names = new Intl.DisplayNames([locale], { type: "currency" });
  const options = CURRENCY_CODES
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((left, right) => left.name.localeCompare(right.name, locale) || left.code.localeCompare(right.code));
  currencyOptionsCache.set(language, options);
  return options;
}

export function getCurrencySymbol(currency: Currency, language: string = "de"): string {
  const locale = getIntlLocale(language);
  const part = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).formatToParts(0).find((token) => token.type === "currency");
  return part?.value ?? currency;
}
