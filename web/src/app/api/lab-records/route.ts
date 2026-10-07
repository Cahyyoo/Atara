import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { can } from "@/lib/permissions";
import { listLabRecordsQuerySchema } from "@/lib/validation";
import { buildLabRecordWhere, labRecordInclude, toLabRecordListItem } from "@/lib/lab-record";

export async function GET(request: NextRequest) {
  try {
    // The Sample Database and Enter Results pages list these; an operator,
    // whose work is on the mobile app, has no page that does.
    const session = await requireCapability(request, "readLabRecords");

    const { searchParams } = new URL(request.url);
    const query = listLabRecordsQuerySchema.parse({
      // Only a role with viewDeletedRecords may look at what was deleted. Read
      // off the session rather than trusted from the query string, or the flag
      // would be a way around the rule rather than subject to it.
      deleted: can(session.role, "viewDeletedRecords")
        ? (searchParams.get("deleted") ?? undefined)
        : undefined,
      search: searchParams.get("search") ?? undefined,
      placeId: searchParams.get("placeId") ?? undefined,
      shiftDate: searchParams.get("shiftDate") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      results: searchParams.get("results") ?? undefined,
      ident: searchParams.get("ident") ?? undefined,
      counts: searchParams.get("counts") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      order: searchParams.get("order") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    const where = buildLabRecordWhere(query);

    /**
     * How many match with and without a result, for the labels on the result
     * filter. Asked for only by the entry page, and two counts on the same
     * filter -- the table is already filtered this way for the list itself.
     */
    // One statement, not two: COUNT(ni) counts the rows with a result, and
    // the difference from COUNT(*) is the rows without one. Same filters as
    // the list, minus the result filter itself.
    const countsPromise = query.counts
      ? prisma.labRecord.aggregate({
          where: buildLabRecordWhere({ ...query, results: undefined }),
          _count: { _all: true, ni: true },
        })
      : null;

    const [total, rows] = await Promise.all([
      prisma.labRecord.count({ where }),
      prisma.labRecord.findMany({
        where,
        include: labRecordInclude,
        orderBy:
          query.sort === "shiftDate"
            ? [{ shiftDate: query.order }, { sequence: query.order }]
            : [{ [query.sort]: query.order }, { shiftDate: "desc" }, { sequence: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const counts = countsPromise ? await countsPromise : null;

    return jsonSuccess({
      ...(counts
        ? {
            counts: {
              missing: counts._count._all - counts._count.ni,
              present: counts._count.ni,
            },
          }
        : {}),
      records: rows.map(toLabRecordListItem),
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
