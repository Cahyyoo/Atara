"use client";

import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/core/components/ui/table";
import { Card, CardContent } from "@/core/components/ui/card";
import { GRADE_FIELDS, type GradeGroup } from "@/modules/lab/lib/analytics/grade-groups";
import type { GradeRow } from "@/modules/lab/lib/analytics/grade-control";

const FIELD_LABELS: Record<(typeof GRADE_FIELDS)[number], string> = {
  ni: "Ni",
  fe: "Fe",
  co: "Co",
  mgo: "MgO",
  sio2: "SiO₂",
};

const pct = (value: number | null) => (value === null ? "—" : value.toFixed(2));

/** Every group's averages, one row each: the chart's numbers, and the rows past its last bar. */
export function GradeTable({
  rows,
  shownGroups,
  groupLabels,
  codeOf,
}: {
  rows: GradeRow[];
  shownGroups: GradeGroup[];
  groupLabels: Record<string, string>;
  codeOf: (row: GradeRow, group: GradeGroup) => string;
}) {
  const t = useTranslations("grade");
  return (
    <Card data-tour="grade-table">
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {shownGroups.map((group) => (
                <TableHead key={group}>{groupLabels[group]}</TableHead>
              ))}
              <TableHead className="text-right">{t("samples")}</TableHead>
              <TableHead className="text-right">{t("assayed")}</TableHead>
              <TableHead className="text-right">{t("niRange")}</TableHead>
              {GRADE_FIELDS.map((field) => (
                <TableHead key={field} className="text-right">
                  {t("avgOf", { field: FIELD_LABELS[field] })}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3 + shownGroups.length + GRADE_FIELDS.length} className="py-8 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.key}>
                  {shownGroups.map((group) => (
                    <TableCell key={group} className="font-mono font-medium">
                      {codeOf(row, group)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{row.samples}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.assayed}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.niMin === null ? "—" : `${pct(row.niMin)} – ${pct(row.niMax)}`}
                  </TableCell>
                  {GRADE_FIELDS.map((field) => (
                    <TableCell
                      key={field}
                      className={
                        field === "ni"
                          ? "text-right font-semibold tabular-nums"
                          : "text-right tabular-nums"
                      }
                    >
                      {pct(row.avg[field])}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
