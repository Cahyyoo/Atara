import { NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { exportResponse } from "@/lib/export-response";
import { ASSAY_FIELDS } from "@/lib/assay";
import type { SheetColumn, SheetRow } from "@/lib/xlsx";

/**
 * An empty sheet in the shape results are read back in.
 *
 * Two shapes, because the two ways of getting results in ask different things
 * of a sheet, and one template pretending to serve both would produce files
 * that are refused by the screen that offered them.
 *
 * "instrument" is the layout the assay machine prints: the timestamp, the
 * eighteen elements, then the method and the solution id. It names no sample,
 * which is exactly why it belongs to the paste screen -- there, rows are
 * matched to the samples that were ticked, in order.
 *
 * "keyed" is the same columns with Sample ID in front. The import screen ticks
 * nothing, so a key column is the only thing that can say which sample a row
 * belongs to. Without it every row would be refused, and guessing instead
 * would write results onto the wrong sample.
 */

type Shape = "instrument" | "keyed";

/** The elements, in the order the instrument prints them. */
const ASSAY_COLUMNS: SheetColumn[] = ASSAY_FIELDS.map((field) => ({
  header: field.csvLabel,
  key: field.key,
  width: 13,
}));

const TRAILING: SheetColumn[] = [
  { header: "Measurement Method", key: "measurementMethod", width: 22 },
  { header: "Solution ID", key: "solutionId", width: 14 },
  { header: "Xray Instrument", key: "xrayInstrument", width: 16 },
];

const SHAPES: Record<Shape, { columns: SheetColumn[]; filename: string }> = {
  instrument: {
    columns: [
      { header: "Measurement Finished", key: "measurementFinished", width: 22 },
      ...ASSAY_COLUMNS,
      ...TRAILING,
    ],
    filename: "results-template",
  },
  keyed: {
    columns: [
      { header: "Sample ID", key: "sampleIdent", width: 30 },
      { header: "Measurement Finished", key: "measurementFinished", width: 22 },
      ...ASSAY_COLUMNS,
      ...TRAILING,
    ],
    filename: "results-template-sample-id",
  },
};

function shapeOf(raw: string | null): Shape {
  return raw === "keyed" ? "keyed" : "instrument";
}

export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "enterResults");

    const { searchParams } = new URL(request.url);
    const shape = SHAPES[shapeOf(searchParams.get("shape"))];

    /**
     * Headings and nothing else.
     *
     * A template with example rows in it gets filled in around them and
     * imported with the examples still there, and an invented lab code is a
     * row that matches nothing -- or worse, one that matches something.
     */
    const rows = async function* (): AsyncIterable<SheetRow> {};

    return exportResponse({
      format: searchParams.get("format") ?? "xlsx",
      sheetName: "Results",
      baseFilename: shape.filename,
      columns: shape.columns,
      rows,
      // It comes back in through the importer: no banner rows above the headers.
      plain: true,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
