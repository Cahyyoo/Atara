import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireSession } from "@/lib/api-auth";
import { consumeAttempt } from "@/lib/rate-limit";
import { ACTIVE_SAMPLE } from "@/lib/soft-delete";
import { normalizeLookupQuery, rankLookupMatches } from "@/lib/sample-lookup";
import { searchIdentForms } from "@/lib/sample-ident";
import type { SampleLookupDTO } from "@/types";

/** Typing fires a request per pause; this is far above any person's pace. */
const LOOKUP_LIMIT = { limit: 120, windowMs: 60_000 };

/** More than are shown, so the ranking has something to choose from. */
const CANDIDATES = 20;

/**
 * The quick search behind Ctrl+K. Open to every role, like the sample page it
 * leads to. Barcode and lab code match from the start, which their unique
 * indexes serve; the Sample ID matches anywhere, because it strings several
 * codes together and people type the piece they know.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!consumeAttempt(`lookup:${session.userId}`, LOOKUP_LIMIT)) {
      throw new ApiError("Too many searches. Please wait a moment.", 429);
    }

    const query = normalizeLookupQuery(new URL(request.url).searchParams.get("q"));
    if (!query) {
      return jsonSuccess({ results: [] as SampleLookupDTO[] });
    }

    const select = {
      sampleCode: true,
      status: true,
      currentStage: { select: { key: true, name: true } },
      labRecord: { select: { labCode: true, sampleIdent: true } },
    } as const;

    // The Sample ID is asked for in every hand it could have been written in:
    // the stored id separates its leading group with spaces, and someone
    // reading one off an older sheet types slashes throughout.
    const forms = searchIdentForms(query);

    // Exact hits are asked for on their own: a short query can match more
    // loose candidates than are fetched, and the one the scanner typed in
    // full must never be the one left out.
    const [exact, loose] = await Promise.all([
      prisma.sample.findMany({
        where: {
          ...ACTIVE_SAMPLE,
          OR: [
            { sampleCode: query },
            { labRecord: { is: { labCode: query } } },
            { labRecord: { is: { sampleIdent: { in: forms } } } },
          ],
        },
        select,
        take: 3,
      }),
      prisma.sample.findMany({
        where: {
          ...ACTIVE_SAMPLE,
          OR: [
            { sampleCode: { startsWith: query } },
            { labRecord: { is: { labCode: { startsWith: query } } } },
            ...forms.map((form) => ({ labRecord: { is: { sampleIdent: { contains: form } } } })),
          ],
        },
        select,
        orderBy: { createdAt: "desc" },
        take: CANDIDATES,
      }),
    ]);
    const rows = [...exact, ...loose];

    const results: SampleLookupDTO[] = rankLookupMatches(
      query,
      rows.map((row) => ({
        sampleCode: row.sampleCode,
        labCode: row.labRecord?.labCode ?? null,
        sampleIdent: row.labRecord?.sampleIdent ?? null,
        status: row.status,
        stageKey: row.currentStage?.key ?? null,
        stageName: row.currentStage?.name ?? null,
      }))
    );

    return jsonSuccess({ results });
  } catch (error) {
    return handleApiError(error);
  }
}
