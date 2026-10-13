"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IoArrowBack } from "react-icons/io5";
import { readSampleOrigin } from "@/modules/lab/lib/samples/sample-origin";

/**
 * Returns to wherever the user came from (the dashboard or the sample database),
 * falling back to the dashboard when this page was opened directly.
 */
export function BackLink({ fallbackHref = "/lab/dashboard" }: { fallbackHref?: string }) {
  const router = useRouter();
  const t = useTranslations("samples.detail");

  return (
    <button
      type="button"
      onClick={() => {
        // The list the sample pages were opened from, filters and all: one step
        // of history may only be another of this sample's pages.
        const origin = readSampleOrigin();
        if (origin) {
          router.push(origin);
        } else if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <IoArrowBack className="size-4" />
      {t("back")}
    </button>
  );
}
