import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { updateWeightsSchema } from "@/lib/validation";
import { readJsonBody } from "@/lib/api-request";
import { resolvePastedKeys } from "@/lib/sub-records";
import { moistureContent, weighingProblem } from "@/lib/mc";
import { WEIGHT_KEYS, type WeightKey } from "@/lib/weights-paste";
import type { WeightsPreviewRow } from "@/types";

/**
 * Moisture-content weighings pasted from a sheet, by Sample ID -- the
 * Database role's alternative to typing them one record at a time.
 *
 * Each row is found the way a results paste finds it (the sack count may be
 * left out), checked as the weighing will stand, and either reported
 * (`dryRun`) or written. Only rows that change something are written, each
 * with its own audit entry; the rest say why they were left.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireCapability(request, "editDatabase");
    const body = updateWeightsSchema.parse(await readJsonBody(request));

    const resolved = await resolvePastedKeys(body.rows.map((row) => row.key));
    const seen = new Set<string>();

    const preview: WeightsPreviewRow[] = body.rows.map((row, index) => {
      const found = resolved[index];
      const base = { line: row.line, key: row.key };
      if (found.status !== "found") {
        // The numbers were read; only the sample was not found. Shown, so
        // that is plain.
        const pasted = { wp: row.wp ?? null, w0: row.w0 ?? null, wd: row.wd ?? null };
        return {
          ...base,
          status: found.status === "ambiguous" ? "ambiguous" : "unknown",
          to: pasted,
          mc: moistureContent(pasted.wp, pasted.w0, pasted.wd),
        };
      }

      const record = found.record;
      const target = {
        id: record.id,
        labCode: record.labCode,
        sampleIdent: record.sampleIdent,
        sampleCode: record.sample.sampleCode,
      };
      const from = { wp: record.wp, w0: record.w0, wd: record.wd };
      const to = { ...from };
      for (const key of WEIGHT_KEYS) {
        if (row[key] !== undefined) to[key] = row[key]!;
      }
      const result = { ...base, record: target, from, to, mc: moistureContent(to.wp, to.w0, to.wd) };

      if (seen.has(record.id)) {
        return { ...result, status: "invalid", message: "This sample is listed more than once." };
      }
      seen.add(record.id);

      const problem = weighingProblem(to.wp, to.w0, to.wd);
      if (problem) return { ...result, status: "invalid", message: problem };
      const changed = WEIGHT_KEYS.some((key) => to[key] !== from[key]);
      return { ...result, status: changed ? "update" : "unchanged" };
    });

    const updates = preview.filter((row) => row.status === "update");
    if (!body.dryRun && updates.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const row of updates) {
          const changes: Partial<Record<WeightKey, { from: number | null; to: number | null }>> = {};
          const data: Partial<Record<WeightKey, number | null>> = {};
          for (const key of WEIGHT_KEYS) {
            if (row.to![key] !== row.from![key]) {
              changes[key] = { from: row.from![key], to: row.to![key] };
              data[key] = row.to![key];
            }
          }
          await tx.labRecord.update({
            where: { id: row.record!.id },
            data: { ...data, updatedById: session.userId },
          });
          await tx.labRecordAudit.create({
            data: {
              labRecordId: row.record!.id,
              changedById: session.userId,
              changes: changes as unknown as Prisma.InputJsonObject,
            },
          });
        }
      });
    }

    const count = (status: WeightsPreviewRow["status"]) => preview.filter((row) => row.status === status).length;
    return jsonSuccess({
      rows: preview,
      summary: {
        total: preview.length,
        update: updates.length,
        unchanged: count("unchanged"),
        unknown: count("unknown") + count("ambiguous"),
        invalid: count("invalid"),
      },
      saved: body.dryRun ? 0 : updates.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
