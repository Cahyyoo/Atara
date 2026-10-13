"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { IoCreateOutline, IoReloadOutline } from "react-icons/io5";
import { MATCH_LIMIT } from "@/modules/lab/components/shared/lab-records-table/columns";

/**
 * New barcodes waiting for their identity: say how many, and offer to do
 * them all in one go instead of ticking box by box.
 */
export function IdentCta({
  total,
  isSelectingMatching,
  onAction,
}: {
  total: number;
  isSelectingMatching: boolean;
  onAction: () => void;
}) {
  const t = useTranslations("database");

  return (
    <div
      data-tour="records-ident-cta"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
    >
      <p className="text-sm">
        <span className="font-medium">{t("identCta.title", { count: total })}</span>{" "}
        <span className="text-muted-foreground">{t("identCta.hint")}</span>
      </p>
      <Button className="ml-auto gap-2" disabled={isSelectingMatching} onClick={onAction}>
        {isSelectingMatching ? (
          <IoReloadOutline className="size-4 animate-spin" />
        ) : (
          <IoCreateOutline className="size-4" />
        )}
        {total > MATCH_LIMIT
          ? t("identCta.actionFirst", { count: MATCH_LIMIT })
          : t("identCta.action", { count: total })}
      </Button>
    </div>
  );
}
