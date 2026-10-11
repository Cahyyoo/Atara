import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, ApiError, jsonSuccess } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { workbookStreamResponse } from "@/lib/export-response";
import { backupGate } from "@/lib/heavy-gate";
import { backupCounts, backupSheets, EXCEL_MAX_ROWS } from "@/lib/backup";
import { formatWitaDateTime } from "@/lib/shift-date";

/**
 * The whole database as one workbook, streamed sheet by sheet. `?counts=1`
 * answers how big it would be, for the page, without building it.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireCapability(request, "exportBackup");
    const counts = await backupCounts();

    if (new URL(request.url).searchParams.get("counts") === "1") {
      return jsonSuccess(counts);
    }

    // Checked before a byte is written: once the stream starts, this can no
    // longer be a 413.
    const largest = Math.max(counts.samples, counts.logs, counts.changes);
    if (largest > EXCEL_MAX_ROWS) {
      throw new ApiError(
        `One sheet would need ${largest} rows, more than Excel can hold (${EXCEL_MAX_ROWS}).`,
        413
      );
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true } });
    const at = new Date();
    const stamp = (formatWitaDateTime(at) ?? "").replace(/[-:]/g, "").replace(" ", "-").slice(0, 13);

    // One at a time: it reads every table, for minutes. See heavy-gate.ts.
    return await backupGate.run(async () =>
      workbookStreamResponse({
        baseFilename: `atara-backup-${stamp}`,
        sheets: backupSheets(counts, user?.name ?? session.email, at),
      })
    );
  } catch (error) {
    return handleApiError(error);
  }
}
