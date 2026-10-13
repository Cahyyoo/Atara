import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "@/core/i18n/config";
import { allMessages } from "@/core/i18n/catalogue";

/**
 * Locale lives in a cookie rather than the URL: the whole app sits behind a
 * login, so there is nothing to share or index per language, and keeping it out
 * of the path avoids moving every route under an [locale] segment.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieValue = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE;

  return {
    locale,
    // Every module's words, for rendering on the server. What reaches the
    // browser is narrowed per person in the layouts (catalogue.ts).
    messages: allMessages(locale),
  };
});
