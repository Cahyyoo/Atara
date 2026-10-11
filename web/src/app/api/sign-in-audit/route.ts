import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";

import {
  listSignInAuditQuerySchema,
  signInAuditSelect,
  signInAuditWhere,
} from "@/lib/sign-in-audit-query";

/**
 * Who signed in, and what they proved.
 *
 * Admin only, like the stage trail: this is data about people. The table has
 * been filling since the face step shipped and nothing has ever read it --
 * which made the whole point of a second factor unanswerable. A session cookie
 * says somebody held a password; only these rows say whether a face or an
 * authenticator was checked as well.
 *
 * The per-outcome summary comes back with the list rather than from a second
 * endpoint, because the two must agree: a summary counted against different
 * filters than the rows below it is worse than no summary.
 */
export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "viewSignInAudit");

    const { searchParams } = new URL(request.url);
    const query = listSignInAuditQuerySchema.parse({
      userId: searchParams.get("userId") ?? undefined,
      outcome: searchParams.get("outcome") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      order: searchParams.get("order") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    const where = signInAuditWhere(query);

    /**
     * The summary ignores only the outcome filter, so picking one narrows the
     * rows while the chips still show every kind. Without that, choosing
     * "password only" would leave a summary of one figure -- and no way back
     * to the comparison that made you click it.
     */
    const summaryWhere = signInAuditWhere({ ...query, outcome: undefined });

    const [total, entries, byOutcome, users] = await Promise.all([
      prisma.signInAudit.count({ where }),
      prisma.signInAudit.findMany({
        where,
        select: signInAuditSelect,
        // id breaks ties, so paging cannot skip or repeat a row when two
        // attempts share a timestamp.
        orderBy: [{ createdAt: query.order }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      // Counted in the database, so the totals stay right however the list is
      // paged.
      prisma.signInAudit.groupBy({
        by: ["outcome"],
        where: summaryWhere,
        _count: { _all: true },
      }),
      /**
       * Names for the filter's own list, deactivated accounts included.
       *
       * ACCOUNT_INACTIVE is an outcome: attempts against a disabled account are
       * exactly what somebody auditing would come looking for, so hiding those
       * people from the filter would hide the rows that matter most.
       */
      prisma.user.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true, isActive: true },
      }),
    ]);

    return jsonSuccess({
      entries: entries.map((entry) => ({
        id: entry.id,
        createdAt: entry.createdAt.toISOString(),
        outcome: entry.outcome,
        // Read from the columns, never inferred from the outcome: the writer
        // stores them deliberately so a new outcome cannot quietly start
        // meaning "verified" here.
        faceVerified: entry.faceVerified,
        totpVerified: entry.totpVerified,
        address: entry.address,
        userId: entry.user.id,
        userName: entry.user.name,
        userEmail: entry.user.email,
      })),
      // Commonest first: the shape of the trail is the first thing to read.
      summary: byOutcome
        .map((row) => ({ outcome: row.outcome, total: row._count._all }))
        .sort((a, b) => b.total - a.total || a.outcome.localeCompare(b.outcome)),
      users,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
