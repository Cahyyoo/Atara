import "server-only";

import { prisma } from "@/core/lib/prisma";
import { idCursorArgs, pagedById, when, type BackupSection } from "@/core/lib/sheets/backup-kit";
import { DATA_SOURCE_FIELDS, HEADERS } from "@/modules/eksplorasi/lib/data-source-columns";
import { dayOf } from "@/modules/eksplorasi/lib/data-source";

/** The Eksplorasi module's part of the backup: every row of the data source. */
export const backupSection: BackupSection = {
  counts: async () => {
    return { dataSource: await prisma.dataSource.count() };
  },
  sheets: () => {
    return [
      {
        name: "Data Source",
        columns: [
          ...DATA_SOURCE_FIELDS.map((key) => ({ header: HEADERS[key], key, width: key === "remarks" ? 30 : 12 })),
          { header: "Created By", key: "createdBy", width: 18 },
          { header: "Created At", key: "createdAt", width: 20 },
        ],
        rows: async function* () {
          const samples = pagedById((cursor) =>
            prisma.dataSource.findMany({
              ...idCursorArgs(cursor),
              include: { createdBy: { select: { name: true } } },
            })
          );
          for await (const sample of samples) {
            yield {
              ...Object.fromEntries(DATA_SOURCE_FIELDS.map((key) => [key, sample[key]])),
              date: dayOf(sample.date),
              createdBy: sample.createdBy.name,
              createdAt: when(sample.createdAt),
            };
          }
        },
      },
    ];
  },
  about: [["Data source", "dataSource"]],
};
