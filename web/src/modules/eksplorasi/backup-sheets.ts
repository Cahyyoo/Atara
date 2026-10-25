import "server-only";

import { prisma } from "@/core/lib/prisma";
import { idCursorArgs, pagedById, when, type BackupSection } from "@/core/lib/sheets/backup-kit";
import { DATA_SOURCE_FIELDS, HEADERS, type DataSourceField } from "@/modules/eksplorasi/lib/data-source-columns";
import { dayOf } from "@/modules/eksplorasi/lib/data-source";
import { CRM_COLUMNS, CRM_KINDS, CRM_SHEET_NAMES, type CrmKind } from "@/modules/eksplorasi/lib/crm-list-columns";

/**
 * The backup holds every column on one sheet, where two headed "Remarks"
 * could not be told apart: there they carry their own names.
 */
const BACKUP_HEADERS: Partial<Record<DataSourceField, string>> = {
  originalSampleIdRemarks: "Original Sample ID Remarks",
  oreasRemarks: "OREAS Remarks",
};

/** A CRM List table, read whole: a few dozen rows, never worth paging. */
function crmRows(kind: CrmKind) {
  const findMany = {
    standard: () => prisma.crmStandard.findMany({ orderBy: [{ standard: "asc" }, { createdAt: "asc" }] }),
    blank: () => prisma.crmBlank.findMany({ orderBy: { createdAt: "asc" } }),
    duplicate: () => prisma.crmDuplicate.findMany({ orderBy: { createdAt: "asc" } }),
  }[kind];
  return async function* () {
    for (const row of (await findMany()) as Record<string, unknown>[]) {
      // Every CRM column is text (varchar), so nothing here needs converting.
      yield Object.fromEntries(
        CRM_COLUMNS[kind].map((column) => [column.field, (row[column.field] as string | null) ?? null])
      );
    }
  };
}

/** The Eksplorasi module's part of the backup: every row of the data source, and the CRM List. */
export const backupSection: BackupSection = {
  counts: async () => {
    const [dataSource, crmStandard, crmBlank, crmDuplicate] = await Promise.all([
      prisma.dataSource.count(),
      prisma.crmStandard.count(),
      prisma.crmBlank.count(),
      prisma.crmDuplicate.count(),
    ]);
    return { dataSource, crmStandard, crmBlank, crmDuplicate };
  },
  sheets: () => {
    return [
      {
        name: "Data Source",
        columns: [
          ...DATA_SOURCE_FIELDS.map((key) => ({
            header: BACKUP_HEADERS[key] ?? HEADERS[key],
            key,
            width: key in BACKUP_HEADERS ? 30 : 12,
          })),
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
      ...CRM_KINDS.map((kind) => ({
        name: CRM_SHEET_NAMES[kind],
        columns: CRM_COLUMNS[kind].map((column) => ({
          header: column.header,
          key: column.field,
          width: column.key ? 18 : 10,
        })),
        rows: crmRows(kind),
      })),
    ];
  },
  about: [
    ["Data source", "dataSource"],
    ["CRM Standart", "crmStandard"],
    ["CRM Blank", "crmBlank"],
    ["CRM Duplicate", "crmDuplicate"],
  ],
};
