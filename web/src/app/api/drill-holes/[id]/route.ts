import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-request";
import { updateDrillHoleSchema } from "@/lib/validation";
import { blankToNull, DRILL_HOLE_SELECT, toDateColumn, toDrillHoleDTO } from "@/lib/drill-hole";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  try {
    await requireCapability(request, "manageDrilling");
    const { id } = await params;

    const row = await prisma.drillHole.findUnique({ where: { id }, select: DRILL_HOLE_SELECT });
    if (!row) throw new ApiError("Drill hole not found.", 404);

    return jsonSuccess(toDrillHoleDTO(row));
  } catch (error) {
    return handleApiError(error);
  }
}

/** Changes only the fields sent. A missing hole is a 404, a taken hole ID a 409. */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const session = await requireCapability(request, "manageDrilling");
    const { id } = await params;
    const body = updateDrillHoleSchema.parse(await readJsonBody(request));

    // The order of the dates is checked against what is stored when only one
    // of them is sent.
    if ((body.startDate === undefined) !== (body.endDate === undefined)) {
      const current = await prisma.drillHole.findUnique({
        where: { id },
        select: { startDate: true, endDate: true },
      });
      if (!current) throw new ApiError("Drill hole not found.", 404);
      const start = body.startDate !== undefined ? body.startDate : current.startDate?.toISOString().slice(0, 10);
      const end = body.endDate !== undefined ? body.endDate : current.endDate?.toISOString().slice(0, 10);
      if (start && end && end < start) {
        throw new ApiError("End date cannot be before the start date.", 422);
      }
    }

    const row = await prisma.drillHole.update({
      where: { id },
      data: {
        ...body,
        area: blankToNull(body.area),
        remarks: blankToNull(body.remarks),
        startDate: toDateColumn(body.startDate),
        endDate: toDateColumn(body.endDate),
        updatedById: session.userId,
      },
      select: DRILL_HOLE_SELECT,
    });

    return jsonSuccess(toDrillHoleDTO(row));
  } catch (error) {
    return handleApiError(error);
  }
}

/** Removed outright: drill holes have nothing hanging off them yet. */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    await requireCapability(request, "manageDrilling");
    const { id } = await params;

    await prisma.drillHole.delete({ where: { id } });

    return jsonSuccess({ id });
  } catch (error) {
    return handleApiError(error);
  }
}
