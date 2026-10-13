import { prisma } from "@/core/lib/prisma";
import { ApiError, jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { workbookStreamResponse } from "@/core/lib/sheets/export-response";
import { backupGate } from "@/modules/system/lib/gates";
import { backupCounts, backupSheets } from "@/modules/backup";
import { EXCEL_MAX_ROWS } from "@/core/lib/sheets/backup-kit";
import { formatWitaDateTime } from "@/core/lib/wita-time";

/**
 * The whole database as one workbook, streamed sheet by sheet. `?counts=1`
 * answers how big it would be, for the page, without building it.
 */
export const GET = route({ capability: "exportBackup" }, async ({ request, session }) => {
  const counts = await backupCounts();

  if (new URL(request.url).searchParams.get("counts") === "1") {
    return jsonSuccess(counts);
  }

  // Checked before a byte is written: once the stream starts, this can no
  // longer be a 413.
  const largest = Math.max(...Object.values(counts));
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
});
