export const LOCALES = ["id", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** The lab runs in Indonesian; English is there for anyone who needs it. */
export const DEFAULT_LOCALE: Locale = "id";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const LOCALE_LABELS: Record<Locale, string> = {
  id: "Bahasa Indonesia",
  en: "English",
};

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (LOCALES as readonly string[]).includes(value);
}
