import "server-only";

import { prisma } from "@/core/lib/prisma";
import { ASSAY_FIELDS } from "@/modules/lab/lib/records/assay";
import { idCursorArgs, num, pagedById, when, type BackupSection } from "@/core/lib/sheets/backup-kit";
import type { SheetRow } from "@/core/lib/sheets/xlsx";

/**
 * The lab's part of the backup: every sample with its lab record (deleted
 * ones included, and marked) and its sub-samples, every stage scan, every
 * change to a result, the master lists and the stages.
 */
export const backupSection: BackupSection = {
  counts: async () => {
    const [samples, logs, changes, masterOptions, stages] = await Promise.all([
      prisma.sample.count(),
      prisma.sampleLog.count(),
      prisma.labRecordAudit.count(),
      prisma.masterOption.count(),
      prisma.stage.count(),
    ]);
    return { samples, logs, changes, masterOptions, stages };
  },
  sheets: () => {
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
          const samples = pagedById((cursor) =>
            prisma.sample.findMany({
              ...idCursorArgs(cursor),
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
          const logs = pagedById((cursor) =>
            prisma.sampleLog.findMany({
              ...idCursorArgs(cursor),
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
          const audits = pagedById((cursor) =>
            prisma.labRecordAudit.findMany({
              ...idCursorArgs(cursor),
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
    ];
  },
  about: [
    ["Samples", "samples"],
    ["Stage log entries", "logs"],
    ["Result changes", "changes"],
    ["Master data codes", "masterOptions"],
    ["Stages", "stages"],
  ],
};
