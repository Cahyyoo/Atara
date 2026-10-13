"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { cn } from "@/core/lib/utils";
import { formatSessionTime } from "@/core/lib/auth/session-client";
import { DEFAULT_WINDOW_DAYS } from "@/modules/lab/lib/analytics/analytics-range";
import {
  IoChevronDown,
  IoDownloadOutline,
  IoFunnelOutline,
  IoReloadOutline,
  IoTvOutline,
} from "react-icons/io5";

interface DashboardToolbarProps {
  from: string;
  onFromChange: (from: string) => void;
  to: string;
  onToChange: (to: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  /** How many filters are applied, shown on the Filters button. */
  filterCount: number;
  /** Whether anything differs from the default window, so Reset is worth showing. */
  canReset: boolean;
  onReset: () => void;
  generatedAt: string | undefined;
  isPolling: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  canDownloadReport: boolean;
  isDownloading: boolean;
  onDownload: () => void;
}

/** The date range, the filters button, and the ways to act on the figures. */
export function DashboardToolbar({
  from,
  onFromChange,
  to,
  onToChange,
  showFilters,
  onToggleFilters,
  filterCount,
  canReset,
  onReset,
  generatedAt,
  isPolling,
  isRefreshing,
  onRefresh,
  canDownloadReport,
  isDownloading,
  onDownload,
}: DashboardToolbarProps) {
  const t = useTranslations("dashboard");

  return (
    <div className="flex flex-wrap items-end gap-3" data-tour="dashboard-range">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="from">{t("rangeFrom")}</Label>
        <Input
          id="from"
          type="date"
          className="w-44"
          value={from}
          onChange={(event) => onFromChange(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="to">{t("rangeTo")}</Label>
        <Input
          id="to"
          type="date"
          className="w-44"
          value={to}
          onChange={(event) => onToChange(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        {/* Spacer label so the button sits on the same baseline as the dates. */}
        <span aria-hidden className="text-sm leading-none">&nbsp;</span>
        <Button
          variant="outline"
          className="gap-2"
          aria-expanded={showFilters} data-tour="dashboard-filters"
          onClick={onToggleFilters}
        >
          <IoFunnelOutline className="size-4" />
          {t("filters")}
          {filterCount > 0 ? (
            <span className="rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {filterCount}
            </span>
          ) : null}
          <IoChevronDown
            className={cn("size-4 transition-transform", showFilters && "rotate-180")}
          />
        </Button>
      </div>
      {canReset ? (
        <Button variant="outline" onClick={onReset}>
          {t("rangeReset", { days: DEFAULT_WINDOW_DAYS })}
        </Button>
      ) : null}

      {/* How fresh the figures are, and the ways to act on them. */}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {generatedAt ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {t("lastUpdated", { time: formatSessionTime(generatedAt) })}
          </span>
        ) : null}
        <Button
          variant="outline"
          size="icon"
          aria-label={t("refresh")} data-tour="dashboard-refresh"
          title={t("refresh")}
          disabled={isPolling || isRefreshing}
          onClick={onRefresh}
        >
          <IoReloadOutline className={cn("size-4", isPolling && "animate-spin")} />
        </Button>
        <Link
          href="/lab/tv" data-tour="dashboard-tv"
          target="_blank"
          className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
        >
          <IoTvOutline className="size-4" />
          {t("tvMode")}
        </Link>
        {canDownloadReport ? (
          <Button
            variant="outline"
            className="gap-2"
            disabled={isDownloading || isRefreshing}
            onClick={onDownload} data-tour="dashboard-report"
          >
            {isDownloading ? (
              <IoReloadOutline className="size-4 animate-spin" />
            ) : (
              <IoDownloadOutline className="size-4" />
            )}
            {t("downloadReport")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
