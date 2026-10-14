"use client";

import { useTranslations } from "next-intl";
import { TableCell } from "@/core/components/ui/table";
import { StatusBadge } from "@/modules/lab/components/samples/status-badge";
import { ASSAY_FIELDS, INSTRUMENT_FIELDS } from "@/modules/lab/lib/records/assay";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { stageLabel } from "@/modules/lab/lib/stages/stages";
import { cn } from "@/core/lib/utils";
import {
  formatAssay,
  formatInstrument,
  formatLeadTime,
  formatMc,
  type Movable,
} from "@/modules/lab/components/shared/lab-records-table/columns";

/** One row's movable cells, in the order the headings were arranged. */
export function RecordCells({
  columns,
  record,
  formatDate,
}: {
  columns: Movable[];
  record: LabRecordListItemDTO;
  formatDate: (shiftDate: string) => string;
}) {
  const tSamples = useTranslations("samples");
  const tStages = useTranslations("stages");

  function cellFor(key: Movable) {
    if (key === "shiftDate") {
      return (
        <TableCell key={key} className="overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">
          {formatDate(record.shiftDate)}
        </TableCell>
      );
    }
    if (key === "status") {
      // A sub-sample is a fraction of its sample, with no barcode or scans of
      // its own: it has no status to show, and borrowing its sample's misleads.
      if (record.parentId) {
        return (
          <TableCell key={key} className="text-muted-foreground/60">
            —
          </TableCell>
        );
      }
      return (
        <TableCell key={key} className="overflow-hidden">
          <div className="flex min-w-0 flex-col items-start gap-0.5">
            <StatusBadge status={record.sample.status} />
            <span className="max-w-full truncate text-xs text-muted-foreground">
              {record.sample.currentStage
                ? stageLabel(tStages, record.sample.currentStage.key, record.sample.currentStage.name)
                : tSamples("notStarted")}
            </span>
          </div>
        </TableCell>
      );
    }
    if (key === "mc" || key === "leadTime") {
      // Lead time belongs to the container: a sub-sample has none of its own.
      const text = key === "mc" ? formatMc(record) : record.parentId ? "—" : formatLeadTime(record.sample.leadTimeHours);
      return (
        <TableCell
          key={key}
          className={cn("overflow-hidden text-right tabular-nums", text === "—" && "text-muted-foreground/60")}
        >
          {text}
        </TableCell>
      );
    }
    const assay = ASSAY_FIELDS.find((field) => field.key === key);
    if (assay) {
      const value = record[assay.key];
      return (
        <TableCell
          key={key}
          className={cn("overflow-hidden text-right tabular-nums", value === null && "text-muted-foreground/60")}
        >
          {formatAssay(value)}
        </TableCell>
      );
    }
    const instrument = INSTRUMENT_FIELDS.find((field) => field.key === key)!;
    const text = formatInstrument(record, instrument);
    return (
      <TableCell key={key} className="overflow-hidden text-ellipsis text-muted-foreground" title={text}>
        {text}
      </TableCell>
    );
  }

  return <>{columns.map((key) => cellFor(key))}</>;
}
