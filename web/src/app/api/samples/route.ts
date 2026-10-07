import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireCapability, requireSession } from "@/lib/api-auth";
import { createSampleSchema, listSamplesQuerySchema } from "@/lib/validation";
import { sampleListInclude, toSampleListItemDTO } from "@/lib/sample-dto";
import { createSamplesWithLabCodes } from "@/lib/sample-creation";
import { ACTIVE_SAMPLE } from "@/lib/soft-delete";
import { sampleIdentWhere } from "@/lib/sample-ident-filter";
import { readJsonBody } from "@/lib/api-request";

export async function GET(request: NextRequest) {
  try {
    await requireSession(request);

    const { searchParams } = new URL(request.url);
    const query = listSamplesQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      stageId: searchParams.get("stageId") ?? undefined,
      ident: searchParams.get("ident") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      order: searchParams.get("order") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    const where: Prisma.SampleWhereInput = { ...ACTIVE_SAMPLE };
    if (query.search) {
      where.sampleCode = { contains: query.search };
    }
    if (query.status) {
      where.status = query.status;
    }
    Object.assign(where, sampleIdentWhere(query.ident));
    if (query.stageId) {
      where.currentStageId = query.stageId;
    }

    const [total, samples] = await Promise.all([
      prisma.sample.count({ where }),
      prisma.sample.findMany({
        where,
        include: sampleListInclude,
        // The tiebreak is the primary key in the same direction as the sort.
        // InnoDB secondary indexes end in the primary key, so this is a pure
        // index walk; `sampleCode asc` forced a filesort of every live row on
        // every page.
        orderBy: [{ [query.sort]: query.order }, { id: query.order }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return jsonSuccess({
      samples: samples.map(toSampleListItemDTO),
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

export async function POST(request: NextRequest) {
  try {
    const session = await requireCapability(request, "generateSamples");

    const body = createSampleSchema.parse(await readJsonBody(request));

    const [sample] = await createSamplesWithLabCodes({
      identities: [body],
      createdById: session.userId,
    });

    return jsonSuccess(sample, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
