/** Input schemas of the Eksplorasi module: drill holes. */
import { z } from "zod";
import { paginationQuery } from "@/core/lib/http/pagination";
import { DRILL_HOLE_STATUSES } from "@/modules/eksplorasi/lib/drill-hole";
import { DRILL_HOLE_FIELDS, type DrillHoleField } from "@/modules/eksplorasi/lib/drill-hole-columns";

/** An optional number in a range; an empty field arrives as null. */
const optionalNumber = (min: number, max: number) =>
  z.coerce.number().min(min).max(max).nullable().optional();

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must use the YYYY-MM-DD format.")
  .nullable()
  .optional();

const drillHoleFields = {
  holeId: z.string().trim().min(1, "Hole ID is required.").max(50),
  area: z.string().trim().max(100).nullable().optional(),
  easting: optionalNumber(-999_999_999, 999_999_999),
  northing: optionalNumber(-999_999_999, 999_999_999),
  elevation: optionalNumber(-99_999, 99_999),
  azimuth: optionalNumber(0, 360),
  dip: optionalNumber(-90, 90),
  totalDepth: optionalNumber(0, 99_999),
  status: z.enum(DRILL_HOLE_STATUSES),
  startDate: optionalDate,
  endDate: optionalDate,
  remarks: z.string().trim().max(5000).nullable().optional(),
};

/** A hole cannot finish before it started. Compared as strings: both are YYYY-MM-DD. */
function datesInOrder(body: { startDate?: string | null; endDate?: string | null }) {
  return !body.startDate || !body.endDate || body.endDate >= body.startDate;
}
const DATES_IN_ORDER = { message: "End date cannot be before the start date.", path: ["endDate"] };

export const createDrillHoleSchema = z
  .object({ ...drillHoleFields, status: drillHoleFields.status.default("PLANNED") })
  .refine(datesInOrder, DATES_IN_ORDER);

export const updateDrillHoleSchema = z
  .object(drillHoleFields)
  .partial()
  .refine(datesInOrder, DATES_IN_ORDER);

/**
 * One row of an imported sheet. Like a new hole, except that a blank status
 * stays blank: on a hole that already exists, an empty cell leaves the stored
 * value alone (drill-hole-upsert.ts), and a default here would overwrite it.
 */
export const importDrillHoleRowSchema = z
  .object({ ...drillHoleFields, status: drillHoleFields.status.optional() })
  .refine(datesInOrder, DATES_IN_ORDER);

/** The rows a save from the sheet can carry: as many as the sheet holds. */
export const DRILL_SHEET_MAX_ROWS = 500;

/**
 * Rows of the drilling sheet, as typed or pasted -- text, read on the server
 * the way an imported file is read (drill-hole-sheet.ts). A row with an `id`
 * is an existing hole unlocked for changing; one without is a new hole.
 */
export const drillHoleSheetSchema = z.object({
  dryRun: z.boolean().default(true),
  rows: z
    .array(
      z.object({
        line: z.number().int().min(1),
        id: z.string().min(1).optional(),
        cells: z.object(
          Object.fromEntries(DRILL_HOLE_FIELDS.map((field) => [field, z.string().max(5000).optional()])) as Record<
            DrillHoleField,
            z.ZodOptional<z.ZodString>
          >
        ),
      })
    )
    .max(DRILL_SHEET_MAX_ROWS),
});

export const listDrillHolesQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(DRILL_HOLE_STATUSES).optional(),
  ...paginationQuery(),
});
