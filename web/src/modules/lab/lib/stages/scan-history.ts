import { getShiftDate, toShiftDateInputValue } from "@/modules/lab/lib/stages/shift-date";
import { workdayBounds } from "@/core/lib/wita-time";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Without a ceiling, `?days=100000` asks the database to aggregate every row it
 * has, on an endpoint with no rate limit. The same reasoning as
 * MAX_WINDOW_DAYS in analytics-range.ts, and the same number.
 */
export const MAX_SCAN_HISTORY_DAYS = 90;

/**
 * This was `MAX_LOGS` inside the route. It is a default page size now rather
 * than a cap — and it has to stay 100, because a phone already in the field
 * sends no query string and 100 is the number of rows it has always been given.
 */
export const SCAN_HISTORY_DEFAULT_PAGE_SIZE = 100;

/**
 * The real instants a run of shift days spans, ending with the current one.
 *
 * `days = 1` is the current shift and nothing else, which is exactly what this
 * endpoint did before it took any parameters at all. That equality is the
 * backwards-compatibility guarantee for phones in the field, and it is asserted
 * in the tests rather than left as a claim.
 */
export function resolveScanHistoryWindow(
  days: number,
  at: Date = new Date()
): { currentShiftDate: Date; firstShiftDate: Date; from: Date; to: Date } {
  const currentShiftDate = getShiftDate(at);
  // A shift day is stored as UTC midnight, so stepping back is exact
  // millisecond arithmetic: no timezone, no DST, nothing to get wrong.
  const firstShiftDate = new Date(currentShiftDate.getTime() - (days - 1) * DAY_MS);

  return {
    currentShiftDate,
    firstShiftDate,
    from: workdayBounds(firstShiftDate).from,
    to: workdayBounds(currentShiftDate).to,
  };
}

/**
 * The shift day each log belongs to, as "YYYY-MM-DD", in the same order.
 *
 * The phone groups its history by these strings rather than computing them.
 * The 07:00 WITA boundary is a business rule with one correct value and one
 * test suite; a Dart reimplementation would be a second copy of it, and the
 * copy nobody updates. Worse, a handset set to WIB would disagree with the
 * shift date the same response already carries at the top level.
 *
 * Relies on [logs] being ordered by scannedAt descending, which is the order
 * the route reads them in. Walking down, the shift day only changes when a row
 * falls before the start of the day we are in — so this calls getShiftDate once
 * per day on screen, not once per row. A hundred-row page usually spans one or
 * two days.
 */
export function labelShiftDays(logs: { scannedAt: Date }[]): string[] {
  let dayStart = Number.POSITIVE_INFINITY;
  let label = "";

  return logs.map((log) => {
    const at = log.scannedAt.getTime();
    if (at < dayStart) {
      const shiftDate = getShiftDate(log.scannedAt);
      label = toShiftDateInputValue(shiftDate);
      dayStart = workdayBounds(shiftDate).from.getTime();
    }
    return label;
  });
}

/**
 * Enough of a note to recognise it, not enough to pay for it.
 *
 * A note may be 1000 characters and doubles as the correction reason, so a
 * hundred of them would be most of the response — for a line the row shows two
 * of anyway, with the full text one tap away on the sample screen.
 *
 * The ellipsis is load-bearing: a sentence cut silently is a lie, one cut
 * visibly with somewhere to go is not.
 */
export function previewNote(notes: string | null, max = 120): string | null {
  const trimmed = notes?.trim();
  if (!trimmed) return null;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

/**
 * One row of a `groupBy(["stageId"])` result.
 *
 * Structural rather than `Prisma.GetSampleLogGroupByPayload`, for the same
 * reason labelShiftDays takes `{ scannedAt: Date }[]`: the decision below is
 * worth testing, and a test should not have to build a Prisma type to reach it.
 */
export type StageRowCount = { stageId: string; _count: { _all: number } };

/**
 * How many rows the window holds, and — only when it is worth asking — how they
 * break down by stage.
 *
 * `total` is a plain count, and that is the whole point. The WHERE it runs
 * against is exactly `@@index([preparator_id, scanned_at])`, so InnoDB answers it
 * from the index without touching a row.
 *
 * A note used to stand in the route saying a separate count() would be "the
 * same question asked twice". It is the same ANSWER, not the same question, and
 * the difference in cost is why this function exists. stage_id is in no usable
 * index, so the groupBy that used to supply `total` had to range-scan the
 * secondary index and then make one clustered PK lookup PER MATCHING ROW, plus
 * build a temp table to group them — some nine thousand random reads at a
 * hundred scans a shift across ninety days. It ran on EVERY page request, and
 * the paged caller reads none of it: ScanHistoryPage.fromJson ignores byStage
 * entirely. Scrolling ten pages paid for it ten times over.
 *
 * So the grouping is computed only for the window that wants it. `days === 1`
 * is the shift-tally call Home makes with no query string at all, where the
 * grouping spans one day and about a hundred rows. Anything wider gets `[]`.
 *
 * The two counts are thunks rather than a `db` parameter, and the next reader
 * will try the delegate first: Prisma's `count`/`groupBy` are generic over
 * their own args types, so a structural `{ count, groupBy }` interface is not
 * assignable from `prisma.sampleLog`, and typing it as
 * `Pick<Prisma.SampleLogDelegate, "count" | "groupBy">` makes a test fake
 * impossible to build. Two closures cost the route one line and the test
 * nothing.
 *
 * Both run concurrently. They used to share the route's one Promise.all and
 * must not become two sequential awaits — there is a test that pins it.
 */
export async function tallyScanHistory(options: {
  days: number;
  countAll: () => Promise<number>;
  countByStage: () => Promise<StageRowCount[]>;
}): Promise<{ total: number; byStageCounts: StageRowCount[] }> {
  const { days, countAll, countByStage } = options;

  const [total, byStageCounts] = await Promise.all([
    countAll(),
    days === 1 ? countByStage() : Promise.resolve<StageRowCount[]>([]),
  ]);

  return { total, byStageCounts };
}
