import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { dataQualityQuerySchema } from "@/lib/validation";
import { exportResponse, EXPORT_ROW_LIMIT } from "@/lib/export-response";
import { qualitySelect, qualityWhere, toQualityRow } from "@/lib/data-quality";
import { formatWitaDateTime } from "@/lib/shift-date";
import type { SheetRow } from "@/lib/xlsx";

const PAGE_SIZE = 2_000;

const GAP_LABELS: Record<string, string> = {
  place: "Place",
  rockType: "Ore class",
  pit: "Pit",
  bargingNo: "Barging",
  sampleIdent: "Sample ID",
  nonProd: "Non-prod",
  sir: "SIR",
};

/** The data-quality list as it is filtered on screen, as CSV or a workbook. */
export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "exportDatabase");

    const { searchParams } = new URL(request.url);
    const query = dataQualityQuerySchema.parse(Object.fromEntries(searchParams));
    const now = new Date();
    const where = qualityWhere(query, now);

    const total = await prisma.labRecord.count({ where });
    if (total > EXPORT_ROW_LIMIT) {
      throw new ApiError(
        `This export would contain ${total} rows. Narrow the filters to at most ${EXPORT_ROW_LIMIT}.`,
        413
      );
    }

    async function* rows(): AsyncIterable<SheetRow> {
      let skip = 0;
      for (;;) {
        const page = await prisma.labRecord.findMany({
          where,
          select: qualitySelect,
          orderBy: [{ createdAt: "asc" }, { labCode: "asc" }],
          skip,
          take: PAGE_SIZE,
        });
        for (const record of page) {
          const row = toQualityRow(record, now);
          yield {
            sampleCode: row.sampleCode,
            labCode: row.labCode,
            sampleIdent: row.sampleIdent,
            createdAt: formatWitaDateTime(row.createdAt),
            ageDays: row.ageDays,
            stage: row.stageName ?? "",
            missing: row.missing.map((gap) => GAP_LABELS[gap]).join(", "),
          };
        }
        if (page.length < PAGE_SIZE) return;
        skip += PAGE_SIZE;
      }
    }

    return exportResponse({
      format: searchParams.get("format"),
      sheetName: query.check === "results" ? "No results" : "Identity gaps",
      baseFilename: `data-quality-${query.check}`,
      columns: [
        { header: "Barcode Code", key: "sampleCode", width: 18 },
        { header: "Lab Code", key: "labCode", width: 18 },
        { header: "Sample ID", key: "sampleIdent", width: 32 },
        { header: "Created At", key: "createdAt", width: 22 },
        { header: "Age (days)", key: "ageDays" },
        { header: "Stage", key: "stage", width: 14 },
        { header: "Missing", key: "missing", width: 40 },
      ],
      rows,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
