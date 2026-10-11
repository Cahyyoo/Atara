import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { createMasterOptionSchema, listMasterOptionsQuerySchema } from "@/lib/validation";
import { masterOptionCount, toMasterOptionDTO } from "@/lib/master-option";
import { invalidateMasterOptions, loadMasterOptions } from "@/lib/master-options-cache";
import { readJsonBody } from "@/lib/api-request";

/** A brand new option cannot be referenced yet, so its counts are all zero. */
const EMPTY_COUNT = {
  placeRecords: 0,
  rockTypeRecords: 0,
  nonProdRecords: 0,
  pitRecords: 0,
  sirRecords: 0,
};

/** Everyone picking from a dropdown needs to read these; only admins change them. */
export async function GET(request: NextRequest) {
  try {
    // Lab data: only the people who work in the lab module.
    await requireCapability(request, "viewDashboard");

    const { searchParams } = new URL(request.url);
    const query = listMasterOptionsQuerySchema.parse({
      kind: searchParams.get("kind") ?? undefined,
      activeOnly: searchParams.get("activeOnly") ?? undefined,
      withUsage: searchParams.get("withUsage") ?? undefined,
    });

    // The usage counts are the expensive part and only one screen shows
    // them; the plain list is what every dropdown reads, and it is cached.
    if (!query.withUsage) {
      const options = await loadMasterOptions(query);
      const response = jsonSuccess({ options: options.map(toMasterOptionDTO) });
      response.headers.set("Cache-Control", "private, max-age=300");
      return response;
    }

    const where: Prisma.MasterOptionWhereInput = {};
    if (query.kind) {
      where.kind = query.kind;
    }
    if (query.activeOnly) {
      where.isActive = true;
    }

    const options = await prisma.masterOption.findMany({
      where,
      include: masterOptionCount,
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    });

    return jsonSuccess({ options: options.map(toMasterOptionDTO) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCapability(request, "manageMasterData");
    const body = createMasterOptionSchema.parse(await readJsonBody(request));

    const code = body.code.toUpperCase();
    const existing = await prisma.masterOption.findUnique({
      where: { kind_code: { kind: body.kind, code } },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError("That code already exists in this list.", 409);
    }

    const option = await prisma.masterOption.create({
      data: {
        kind: body.kind,
        code,
        label: body.label ?? null,
        sortOrder: body.sortOrder ?? 0,
      },
    });

    invalidateMasterOptions();
    return jsonSuccess(toMasterOptionDTO({ ...option, _count: EMPTY_COUNT }), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
