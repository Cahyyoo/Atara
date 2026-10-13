"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/core/components/ui/button";
import { ExportDialog } from "@/modules/lab/components/shared/export-dialog";
import {
  LabRecordFilters,
  type LabRecordFilterValues,
} from "@/modules/lab/components/shared/lab-record-filters";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { cn } from "@/core/lib/utils";
import { IoClipboardOutline, IoCloudUploadOutline, IoTimeOutline } from "react-icons/io5";
import type { LabRecordsAccess } from "@/modules/lab/components/shared/lab-records-table/types";
import { useRecordsExport } from "@/modules/lab/components/shared/lab-records-table/use-records-export";

/** The filters, and beside them everything that acts on the table as a whole. */
export function RecordsToolbar({
  access,
  isAssay,
  filters,
  counts,
  showDeleted,
  columnPicker,
  buildParams,
  setError,
  onFiltersChange,
  onPaste,
  onImport,
  onOpenWeights,
}: {
  access: LabRecordsAccess;
  isAssay: boolean;
  filters: LabRecordFilterValues;
  counts: { missing: number; present: number } | null;
  showDeleted: boolean;
  columnPicker: ReactNode;
  buildParams: () => URLSearchParams;
  setError: (error: string | null) => void;
  onFiltersChange: (updates: Record<string, string | null>) => void;
  onPaste?: (records: LabRecordListItemDTO[]) => void;
  onImport?: () => void;
  onOpenWeights: () => void;
}) {
  const t = useTranslations("database");
  const { exportSubs, setExportSubs, exportPlace, setExportPlace, handleExport } = useRecordsExport({
    buildParams,
    placeId: filters.placeId,
    setError,
  });

  return (
    // Every control on one row: search, the three filters, then what acts
    // on the table. It used to take three rows before the first sample.
    <LabRecordFilters
      values={filters}
      onChange={onFiltersChange}
      showResults
      // On the entry list the choice is the point, so it stays in view as
      // buttons with their counts; in the database it is one filter of four.
      resultsVariant={isAssay ? "segmented" : "select"}
      resultsDefault={isAssay ? "missing" : "all"}
      counts={counts}
      showIdent={!isAssay}
      trailing={
        <>
          {columnPicker}
          {/* No ticking needed: a sheet with a Sample ID column finds its
              own samples, and fills or creates their sub-samples. */}
          {isAssay && onPaste ? (
            <Button data-tour="assay-paste" variant="outline" className="gap-2" onClick={() => onPaste([])}>
              <IoClipboardOutline className="size-4" />
              {t("paste.openAll")}
            </Button>
          ) : null}
          {/* Who changed which result, and when, across every sample. */}
          <Link href="/lab/assay/history" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
            <IoTimeOutline className="size-4" />
            {t("history.open")}
          </Link>
          {isAssay && onImport ? (
            <Button data-tour="assay-import" variant="outline" className="gap-2" onClick={onImport}>
              <IoCloudUploadOutline className="size-4" />
              {t("importFile")}
            </Button>
          ) : null}
          {!isAssay && access.canEdit && !showDeleted ? (
            <Button variant="outline" className="gap-2" onClick={onOpenWeights}>
              <IoClipboardOutline className="size-4" />
              {t("weights.open")}
            </Button>
          ) : null}
          {!isAssay && access.canExport ? (
            <ExportDialog
              kind="labRecords"
              tourId="records-export"
              onExport={handleExport}
              option={{ label: t("subs.exportOption"), checked: exportSubs, onChange: setExportSubs }}
              place={{ value: exportPlace ?? filters.placeId, onChange: (id) => setExportPlace(id ?? "ALL") }}
            />
          ) : null}
        </>
      }
    />
  );
}
