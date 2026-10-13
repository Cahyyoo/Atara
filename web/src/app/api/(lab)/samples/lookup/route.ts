import { prisma } from "@/core/lib/prisma";
import { jsonSuccess, ApiError } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { consumeAttempt } from "@/core/lib/http/rate-limit";
import { ACTIVE_SAMPLE } from "@/modules/lab/lib/samples/soft-delete";
import { normalizeLookupQuery, rankLookupMatches } from "@/modules/lab/lib/samples/sample-lookup";
import { searchIdentForms } from "@/modules/lab/lib/samples/sample-ident";
import type { SampleLookupDTO } from "@/modules/lab/types";

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
export const GET = route({ capability: "viewDashboard" }, async ({ request, session }) => {
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
});
