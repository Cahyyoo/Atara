/** Input schemas of the Eksplorasi module: the data source and the CRM List. */
import { z } from "zod";
import { paginationQuery } from "@/core/lib/http/pagination";
import {
  DATA_SOURCE_FIELDS,
  DATA_SOURCE_VIEWS,
  ELEMENT_FIELDS,
  MAX_LENGTH,
  SAMPLE_TYPES,
  TEXT_FIELDS,
  type DataSourceField,
} from "@/modules/eksplorasi/lib/data-source-columns";
import { CRM_COLUMNS, CRM_KINDS, type CrmKind } from "@/modules/eksplorasi/lib/crm-list-columns";
import { CONTROL_ELEMENTS } from "@/modules/eksplorasi/lib/qc-control";

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must use the YYYY-MM-DD format.")
  .nullable()
  .optional();

/** Optional text up to the column's length; an empty field arrives as null or "". */
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const textFields = Object.fromEntries(
  [...TEXT_FIELDS, ...ELEMENT_FIELDS]
    .filter((field) => field !== "sampleId")
    .map((field) => [field, optionalText(MAX_LENGTH[field])])
) as Record<Exclude<(typeof TEXT_FIELDS)[number] | (typeof ELEMENT_FIELDS)[number], "sampleId">, ReturnType<typeof optionalText>>;

const dataSourceFields = {
  ...textFields,
  sampleId: z.string().trim().min(1, "Sample ID is required.").max(MAX_LENGTH.sampleId),
  sampleType: z.enum(SAMPLE_TYPES, { error: "Sample type must be FIELD, STANDARD, BLANK or DUPLICATE." }),
  date: optionalDate,
};

/** A new row, and one row of an imported sheet: a sample ID and a type, the rest optional. */
export const createDataSourceSchema = z.object(dataSourceFields);

/** Changes only the fields sent. */
export const updateDataSourceSchema = z.object(dataSourceFields).partial();

export const dataSourceViewSchema = z.enum(DATA_SOURCE_VIEWS);

/** The rows a save from the sheet can carry: as many as the sheet holds. */
export const SHEET_MAX_ROWS = 500;

/**
 * Rows of a list's sheet, as typed or pasted -- text, read on the server the
 * way an imported file is read (data-source-sheet.ts). A row with an `id` is
 * an existing row unlocked for changing; one without is a new row. Only the
 * view's own columns are sent, and only those are changed.
 */
export const dataSourceSheetSchema = z.object({
  dryRun: z.boolean().default(true),
  view: dataSourceViewSchema,
  rows: z
    .array(
      z.object({
        line: z.number().int().min(1),
        id: z.string().min(1).optional(),
        cells: z.object(
          Object.fromEntries(DATA_SOURCE_FIELDS.map((field) => [field, z.string().max(5000).optional()])) as Record<
            DataSourceField,
            z.ZodOptional<z.ZodString>
          >
        ),
      })
    )
    .max(SHEET_MAX_ROWS),
});

export const listDataSourceQuerySchema = z.object({
  view: dataSourceViewSchema.default("dataSource"),
  search: z.string().trim().optional(),
  campaign: z.string().trim().optional(),
  sampleType: z.enum(SAMPLE_TYPES).optional(),
  ...paginationQuery(),
});

/** Most Sample IDs one search answers with: typing more narrows it. */
export const SAMPLE_ID_SEARCH_LIMIT = 50;

/** The Duplicate list's Remarks dropdown: the FIELD samples whose Sample ID holds the search. */
export const sampleIdSearchQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(SAMPLE_ID_SEARCH_LIMIT).default(SAMPLE_ID_SEARCH_LIMIT),
});

/** A campaign as a dashboard filter: absent for every campaign. As long as the column holds. */
const campaignFilter = z.string().trim().min(1).max(100).optional();

/** The dashboard's control charts and standard table: which OREAS standard, by its CRM List name, and which campaign. */
export const qcControlQuerySchema = z.object({
  standard: z.string().trim().min(1).max(50).optional(),
  campaign: campaignFilter,
});

/** The Remarks on one standard and element in the standard table; empty removes it. */
export const qcStandardRemarkSchema = z.object({
  standard: z.string().trim().min(1).max(50),
  element: z.enum(CONTROL_ELEMENTS),
  remarks: z.string().trim().max(500),
});

/** The dashboard's duplicate charts and table: which campaign, and which month of the duplicates' date. */
export const qcDuplicateQuerySchema = z.object({
  campaign: campaignFilter,
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

/** The dashboard's blank charts: which campaign, or every one when absent. As long as the column holds. */
export const qcBlankQuerySchema = z.object({
  campaign: campaignFilter,
});

/** The CRM List's three tables, by the name the API path carries. */
export const crmKindSchema = z.enum(CRM_KINDS);

/**
 * A row of one CRM table. What names the row is required; every value is
 * optional text, as the lab writes it -- "<=10%" is a value too.
 */
export function crmRowSchema(kind: CrmKind) {
  return z.object(
    Object.fromEntries(
      CRM_COLUMNS[kind].map((column) => [
        column.field,
        column.key
          ? z.string().trim().min(1, `${column.header} is required.`).max(column.maxLength)
          : optionalText(column.maxLength),
      ])
    ) as Record<string, z.ZodType<string | null | undefined>>
  );
}

/** A change to a row: only the fields sent, and a name, if sent, still not blank. */
export const crmRowChangeSchema = (kind: CrmKind) => crmRowSchema(kind).partial();
