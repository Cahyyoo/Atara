import "server-only";

import { prisma } from "@/lib/prisma";
import { ASSAY_FIELDS } from "@/lib/assay";
import { formatWitaDateTime } from "@/lib/shift-date";
import type { StreamedSheet } from "@/lib/export-response";
import type { SheetRow } from "@/lib/xlsx";

/** Rows read per query; every sheet pages with a cursor on the primary key. */
const PAGE_SIZE = 2_000;

/** One sheet in Excel holds this many rows below the header. */
export const EXCEL_MAX_ROWS = 1_048_575;

const when = (value: Date | null | undefined) => (value ? formatWitaDateTime(value) : null);
const num = (value: unknown) => (value == null ? null : Number(value));

/** Pages through a table by id, so neither the query nor the response holds it all. */
async function* paged<T extends { id: string }>(
  read: (cursor: string | undefined) => Promise<T[]>
): AsyncIterable<T> {
  let cursor: string | undefined;
  for (;;) {
    const page = await read(cursor);
    yield* page;
    if (page.length < PAGE_SIZE) return;
    cursor = page[page.length - 1].id;
  }
}

const cursorArgs = (cursor: string | undefined) =>
  ({
    take: PAGE_SIZE,
    orderBy: { id: "asc" as const },
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  }) as const;

/** How many rows each sheet will have, for the About sheet and the size check. */
export async function backupCounts() {
  const [samples, logs, changes, masterOptions, stages, users] = await Promise.all([
    prisma.sample.count(),
    prisma.sampleLog.count(),
    prisma.labRecordAudit.count(),
    prisma.masterOption.count(),
    prisma.stage.count(),
    prisma.user.count(),
  ]);
  return { samples, logs, changes, masterOptions, stages, users };
}

export type BackupCounts = Awaited<ReturnType<typeof backupCounts>>;

/**
 * The whole database as sheets: every sample with its lab record (deleted
 * ones included, and marked), every stage scan, every change to a result,
 * the master lists, the stages and the accounts. Accounts go out without
 * their password hash, authenticator secret or face readings: a backup file
 * gets copied around, and none of those belong in one.
 */
export function backupSheets(counts: BackupCounts, by: string, at: Date): StreamedSheet[] {
  const optionCode = new Map<string, string>();
  const codeOf = (id: string | null) => (id ? (optionCode.get(id) ?? id) : null);

  return [
    {
      name: "Samples",
      columns: [
        { header: "Barcode Code", key: "sampleCode", width: 18 },
        { header: "Status", key: "status", width: 13 },
        { header: "Stage", key: "stage", width: 12 },
        { header: "Stage Entered At", key: "stageEnteredAt", width: 20 },
        { header: "Created At", key: "createdAt", width: 20 },
        { header: "Created By", key: "createdBy", width: 18 },
        { header: "Deleted At", key: "deletedAt", width: 20 },
        { header: "Deleted By", key: "deletedBy", width: 18 },
        { header: "Lab Code", key: "labCode", width: 22 },
        { header: "Shift Date", key: "shiftDate", width: 12 },
        { header: "Place", key: "place" },
        { header: "Ore Class", key: "rockType" },
        { header: "Non-prod", key: "nonProd" },
        { header: "SIR", key: "sir" },
        { header: "Pit", key: "pit" },
        { header: "Barging", key: "bargingNo" },
        { header: "Sequence No", key: "sequenceNo" },
        { header: "Sample No", key: "sampleNo" },
        { header: "Sacks", key: "sackCount" },
        { header: "Sample ID", key: "sampleIdent", width: 32 },
        ...ASSAY_FIELDS.map((field) => ({ header: field.csvLabel, key: field.key, width: 10 })),
        { header: "Measurement Method", key: "measurementMethod", width: 18 },
        { header: "Solution ID", key: "solutionId", width: 14 },
        { header: "Measurement Finished", key: "measurementFinished", width: 20 },
        { header: "Xray Instrument", key: "xrayInstrument", width: 16 },
        { header: "Wp", key: "wp", width: 10 },
        { header: "W0", key: "w0", width: 10 },
        { header: "Wd", key: "wd", width: 10 },
        { header: "Remarks", key: "remarks", width: 30 },
        { header: "Results Updated By", key: "updatedBy", width: 18 },
        { header: "Results Updated At", key: "updatedAt", width: 20 },
      ],
      rows: async function* (): AsyncIterable<SheetRow> {
        // The master codes first, once: every row names its place, pit and so
        // on by code, which is what a reader of the file understands.
        for (const option of await prisma.masterOption.findMany({ select: { id: true, code: true } })) {
          optionCode.set(option.id, option.code);
        }
        const samples = paged((cursor) =>
          prisma.sample.findMany({
            ...cursorArgs(cursor),
            include: {
              currentStage: { select: { name: true } },
              createdBy: { select: { name: true } },
              deletedBy: { select: { name: true } },
              labRecord: {
                include: {
                  updatedBy: { select: { name: true } },
                  subs: { include: { updatedBy: { select: { name: true } } }, orderBy: { subCode: "asc" } },
                },
              },
            },
          })
        );
        for await (const sample of samples) {
          // Its sub-samples right after it, each a row of its own: the
          // same container, results of their own.
          for (const record of [sample.labRecord, ...(sample.labRecord?.subs ?? [])]) {
            yield {
              sampleCode: sample.sampleCode,
              status: sample.status,
              stage: sample.currentStage?.name ?? null,
              stageEnteredAt: when(sample.stageEnteredAt),
              createdAt: when(sample.createdAt),
              createdBy: sample.createdBy.name,
              deletedAt: when(sample.deletedAt),
              deletedBy: sample.deletedBy?.name ?? null,
              labCode: record?.labCode ?? null,
              shiftDate: record ? record.shiftDate.toISOString().slice(0, 10) : null,
              place: codeOf(record?.placeId ?? null),
              rockType: codeOf(record?.rockTypeId ?? null),
              nonProd: codeOf(record?.nonProdId ?? null),
              sir: codeOf(record?.sirId ?? null),
              pit: codeOf(record?.pitId ?? null),
              bargingNo: record?.bargingNo ?? null,
              sequenceNo: record?.sequenceNo ?? null,
              sampleNo: record?.sampleNo ?? null,
              sackCount: record?.sackCount ?? null,
              sampleIdent: record?.sampleIdent ?? null,
              ...Object.fromEntries(
                ASSAY_FIELDS.map((field) => [field.key, num(record?.[field.key])])
              ),
              measurementMethod: record?.measurementMethod ?? null,
              solutionId: record?.solutionId ?? null,
              measurementFinished: when(record?.measurementFinished),
              xrayInstrument: record?.xrayInstrument ?? null,
              wp: num(record?.wp),
              w0: num(record?.w0),
              wd: num(record?.wd),
              remarks: record?.remarks ?? null,
              updatedBy: record?.updatedBy?.name ?? null,
              updatedAt: when(record?.updatedAt),
            };
          }
        }
      },
    },
    {
      name: "Stage log",
      columns: [
        { header: "Barcode Code", key: "sampleCode", width: 18 },
        { header: "Stage", key: "stage", width: 12 },
        { header: "By", key: "operator", width: 18 },
        { header: "Recorded At", key: "scannedAt", width: 20 },
        { header: "Correction", key: "isCorrection", width: 11 },
        { header: "Notes", key: "notes", width: 40 },
      ],
      rows: async function* () {
        const logs = paged((cursor) =>
          prisma.sampleLog.findMany({
            ...cursorArgs(cursor),
            include: {
              sample: { select: { sampleCode: true } },
              stage: { select: { name: true } },
              operator: { select: { name: true } },
            },
          })
        );
        for await (const log of logs) {
          yield {
            sampleCode: log.sample.sampleCode,
            stage: log.stage.name,
            operator: log.operator.name,
            scannedAt: when(log.scannedAt),
            isCorrection: log.isCorrection ? "Yes" : "No",
            notes: log.notes,
          };
        }
      },
    },
    {
      name: "Result changes",
      columns: [
        { header: "Barcode Code", key: "sampleCode", width: 18 },
        { header: "Lab Code", key: "labCode", width: 22 },
        { header: "Changed At", key: "changedAt", width: 20 },
        { header: "By", key: "changedBy", width: 18 },
        { header: "Reason", key: "reason", width: 30 },
        { header: "Changes", key: "changes", width: 60 },
      ],
      rows: async function* () {
        const audits = paged((cursor) =>
          prisma.labRecordAudit.findMany({
            ...cursorArgs(cursor),
            include: {
              changedBy: { select: { name: true } },
              labRecord: {
                select: {
                  labCode: true,
                  sample: { select: { sampleCode: true } },
                  parent: { select: { sample: { select: { sampleCode: true } } } },
                },
              },
            },
          })
        );
        for await (const audit of audits) {
          yield {
            sampleCode: (audit.labRecord.sample ?? audit.labRecord.parent?.sample)?.sampleCode ?? null,
            labCode: audit.labRecord.labCode,
            changedAt: when(audit.changedAt),
            changedBy: audit.changedBy.name,
            reason: audit.reason,
            changes: JSON.stringify(audit.changes),
          };
        }
      },
    },
    {
      name: "Master data",
      columns: [
        { header: "Kind", key: "kind", width: 12 },
        { header: "Code", key: "code" },
        { header: "Label", key: "label", width: 30 },
        { header: "Active", key: "isActive", width: 8 },
        { header: "Order", key: "sortOrder", width: 8 },
      ],
      rows: async function* () {
        const options = await prisma.masterOption.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] });
        for (const option of options) {
          yield {
            kind: option.kind,
            code: option.code,
            label: option.label,
            isActive: option.isActive ? "Yes" : "No",
            sortOrder: option.sortOrder,
          };
        }
      },
    },
    {
      name: "Stages",
      columns: [
        { header: "Order", key: "sequenceOrder", width: 8 },
        { header: "Key", key: "key", width: 12 },
        { header: "Name", key: "name", width: 16 },
      ],
      rows: async function* () {
        for (const stage of await prisma.stage.findMany({ orderBy: { sequenceOrder: "asc" } })) {
          yield { sequenceOrder: stage.sequenceOrder, key: stage.key, name: stage.name };
        }
      },
    },
    {
      name: "Users",
      columns: [
        { header: "Name", key: "name", width: 22 },
        { header: "Email", key: "email", width: 28 },
        { header: "Role", key: "role", width: 11 },
        { header: "Active", key: "isActive", width: 8 },
        { header: "Created At", key: "createdAt", width: 20 },
      ],
      rows: async function* () {
        // Selected column by column: nothing secret can ride along by accident.
        const users = await prisma.user.findMany({
          select: { name: true, email: true, role: true, isActive: true, createdAt: true },
          orderBy: { name: "asc" },
        });
        for (const user of users) {
          yield {
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive ? "Yes" : "No",
            createdAt: when(user.createdAt),
          };
        }
      },
    },
    {
      name: "About",
      columns: [
        { header: "Item", key: "item", width: 22 },
        { header: "Value", key: "value", width: 40 },
      ],
      rows: async function* () {
        const lines: [string, string | number | null][] = [
          ["Backup taken at", formatWitaDateTime(at)],
          ["Taken by", by],
          ["Samples", counts.samples],
          ["Stage log entries", counts.logs],
          ["Result changes", counts.changes],
          ["Master data codes", counts.masterOptions],
          ["Stages", counts.stages],
          ["Users", counts.users],
          ["Not included", "Passwords, authenticator secrets, face readings, sign-in sessions"],
        ];
        for (const [item, value] of lines) yield { item, value };
      },
    },
  ];
}
