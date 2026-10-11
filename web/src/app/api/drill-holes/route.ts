import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-request";
import { createDrillHoleSchema, listDrillHolesQuerySchema } from "@/lib/validation";
import { blankToNull, DRILL_HOLE_SELECT, drillHoleWhere, toDateColumn, toDrillHoleDTO } from "@/lib/drill-hole";

/** The drill holes, newest first, by hole ID or area and by status. */
export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "manageDrilling");

    const { searchParams } = new URL(request.url);
    const query = listDrillHolesQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") || undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    const where = drillHoleWhere(query);

    const [total, rows] = await Promise.all([
      prisma.drillHole.count({ where }),
      prisma.drillHole.findMany({
        where,
        select: DRILL_HOLE_SELECT,
        orderBy: [{ createdAt: "desc" }, { holeId: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return jsonSuccess({
      drillHoles: rows.map(toDrillHoleDTO),
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

/** A new drill hole. A hole ID already in use is refused with 409. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireCapability(request, "manageDrilling");
    const body = createDrillHoleSchema.parse(await readJsonBody(request));

    const row = await prisma.drillHole.create({
      data: {
        ...body,
        area: blankToNull(body.area),
        remarks: blankToNull(body.remarks),
        startDate: toDateColumn(body.startDate),
        endDate: toDateColumn(body.endDate),
        createdById: session.userId,
      },
      select: DRILL_HOLE_SELECT,
    });

    return jsonSuccess(toDrillHoleDTO(row), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
