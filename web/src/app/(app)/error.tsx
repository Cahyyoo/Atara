"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";

/**
 * What a page shows when its server render threw.
 *
 * Without this, a database that is momentarily saturated during the dashboard
 * render -- the exact thing that happens at shift change -- produced Next's
 * default error screen: no wording of ours, no way back but the address bar.
 * The API routes already answer that situation with a 503 and "try again in a
 * moment"; this is the same sentence for a page.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  useEffect(() => {
    // The digest is what matches this screen to the server-side log line.
    console.error("[page]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-xl font-semibold tracking-tight">{t("errorTitle")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("errorBody")}</p>
      <Button onClick={() => reset()}>{t("retry")}</Button>
    </div>
  );
}
