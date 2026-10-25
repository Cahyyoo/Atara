import type { Prisma } from "@prisma/client";
import { ELEMENT_FIELDS, VIEWS, type DataSourceView, type SampleType } from "@/modules/eksplorasi/lib/data-source-columns";
import type { DataSourceDTO } from "@/modules/eksplorasi/types";

/**
 * Every data-source response goes through this select and `toDataSourceDTO`,
 * so the browser always gets YYYY-MM-DD dates rather than midnight-UTC
 * timestamps.
 */
export const DATA_SOURCE_SELECT = {
  id: true,
  controlDate: true,
  control: true,
  campaign: true,
  no: true,
  holeId: true,
  sampleId: true,
  sampleType: true,
  from: true,
  to: true,
  originalSampleIdRemarks: true,
  oreasRemarks: true,
  date: true,
  weight: true,
  ...(Object.fromEntries(ELEMENT_FIELDS.map((field) => [field, true])) as Record<(typeof ELEMENT_FIELDS)[number], true>),
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
} satisfies Prisma.DataSourceSelect;

type DataSourceRow = Prisma.DataSourceGetPayload<{ select: typeof DATA_SOURCE_SELECT }>;

/** A DATE column's day, as YYYY-MM-DD. */
export const dayOf = (value: Date | null) => (value === null ? null : value.toISOString().slice(0, 10));

export function toDataSourceDTO(row: DataSourceRow): DataSourceDTO {
  const { createdBy, updatedBy, date, createdAt, updatedAt, ...values } = row;
  return {
    ...values,
    date: dayOf(date),
    createdBy: createdBy?.name ?? null,
    updatedBy: updatedBy?.name ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

export interface DataSourceFilter {
  view?: DataSourceView;
  search?: string;
  campaign?: string;
  /** Only on the data source, which shows every type. */
  sampleType?: SampleType;
}

/**
 * A list's filters, shared by the page's list and its export so both show the
 * same rows. A QC list is held to its own type whatever else is asked.
 */
export function dataSourceWhere(query: DataSourceFilter): Prisma.DataSourceWhereInput {
  const fixed = VIEWS[query.view ?? "dataSource"].sampleType;
  const sampleType = fixed ?? query.sampleType;
  return {
    ...(sampleType ? { sampleType } : {}),
    ...(query.campaign ? { campaign: query.campaign } : {}),
    ...(query.search
      ? {
          OR: [
            { sampleId: { contains: query.search } },
            { holeId: { contains: query.search } },
            { control: { contains: query.search } },
            { campaign: { contains: query.search } },
          ],
        }
      : {}),
  };
}

/** A YYYY-MM-DD from the form, as the DATE column's value; null and undefined pass through. */
export function toDateColumn(value: string | null | undefined): Date | null | undefined {
  if (value === undefined || value === null) return value;
  return new Date(`${value}T00:00:00.000Z`);
}

/** Blank text is no text: an emptied field clears the column. */
export function blankToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  return value === "" ? null : value;
}
