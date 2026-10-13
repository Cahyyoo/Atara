import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { jsonSuccess, handleApiError } from "@/core/lib/http/api-response";
import { requireCapability } from "@/core/lib/http/api-auth";
import { route } from "@/core/lib/http/api-route";
import { createSampleSchema, listSamplesQuerySchema } from "@/modules/lab/validation/samples";
import { sampleListInclude, toSampleListItemDTO } from "@/modules/lab/lib/samples/sample-dto";
import { createSamplesWithLabCodes } from "@/modules/lab/lib/samples/sample-creation";
import { ACTIVE_SAMPLE } from "@/modules/lab/lib/samples/soft-delete";
import { sampleIdentWhere } from "@/modules/lab/lib/samples/sample-ident-filter";
import { readJsonBody } from "@/core/lib/http/api-request";

export async function GET(request: NextRequest) {
  try {
    // Lab data: only the people who work in the lab module.
    await requireCapability(request, "viewDashboard");

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

export const POST = route({ capability: "generateSamples" }, async ({ request, session }) => {
  const body = createSampleSchema.parse(await readJsonBody(request));

  const [sample] = await createSamplesWithLabCodes({
    identities: [body],
    createdById: session.userId,
  });

  return jsonSuccess(sample, 201);
});
