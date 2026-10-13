"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Badge } from "@/core/components/ui/badge";
import { TableCell } from "@/core/components/ui/table";
import { AnimatedTableRow } from "@/core/components/ui/animated-table-row";
import type { DrillHoleDTO, DrillHoleStatus } from "@/modules/eksplorasi/types";
import { IoPencilOutline, IoTrashOutline } from "react-icons/io5";

/** One colour per status, so a list of holes reads at a glance. */
export const STATUS_VARIANT: Record<DrillHoleStatus, "default" | "secondary" | "outline" | "destructive"> = {
  PLANNED: "outline",
  ONGOING: "default",
  COMPLETED: "secondary",
  ABANDONED: "destructive",
};

/** One drill hole in the list: where it is, which way it points, how deep, when. */
export function DrillHoleRow({
  row,
  index,
  onEdit,
  onDelete,
}: {
  row: DrillHoleDTO;
  index: number;
  onEdit: (row: DrillHoleDTO) => void;
  onDelete: (row: DrillHoleDTO) => void;
}) {
  const t = useTranslations("drilling");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const number = (value: number | null, digits = 2) =>
    value === null ? tCommon("empty") : format.number(value, { maximumFractionDigits: digits });
  const date = (value: string | null) =>
    value === null ? tCommon("empty") : format.dateTime(new Date(`${value}T00:00:00`), { dateStyle: "medium" });

  return (
    <AnimatedTableRow index={index}>
      <TableCell className="font-mono font-medium">{row.holeId}</TableCell>
      <TableCell>{row.area ?? tCommon("empty")}</TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[row.status]}>{t(`status.${row.status}`)}</Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right font-mono text-xs">
        <div>E {number(row.easting, 3)}</div>
        <div>N {number(row.northing, 3)}</div>
        <div className="text-muted-foreground">Z {number(row.elevation)}</div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right font-mono text-xs">
        <div>
          {t("columns.azimuthShort")} {number(row.azimuth)}°
        </div>
        <div>
          {t("columns.dipShort")} {number(row.dip)}°
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right font-mono">
        {row.totalDepth === null ? tCommon("empty") : `${number(row.totalDepth)} m`}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm">
        <div>{date(row.startDate)}</div>
        <div className="text-muted-foreground">{date(row.endDate)}</div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEdit(row)}>
            <IoPencilOutline className="size-3.5" />
            {tCommon("edit")}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("delete.label", { holeId: row.holeId })}
            onClick={() => onDelete(row)}
          >
            <IoTrashOutline className="size-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </AnimatedTableRow>
  );
}
