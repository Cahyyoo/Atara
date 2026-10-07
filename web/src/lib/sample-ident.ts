/**
 * Builds the Sample ID the lab writes on the sheet, e.g.
 *
 *     MOL/LIM/TP/S3/PA4/B42/919.3/12
 *      │   │  │  │   │   │   │  │ └─ sacks
 *      │   │  │  │   │   │   │  └─ sample number
 *      │   │  │  │   │   │   └─ running number
 *      │   │  │  │   │   └─ barging run
 *      │   │  │  │   └─ pit
 *      │   │  │  └─ sir, the field stockpile it waited on
 *      │   │  └─ non-production code
 *      │   └─ rock type
 *      └─ place
 *
 * That is the full form. Only the place is required; any other part that is
 * not known is left out and the id closes up around it.
 *
 * Kept as a pure function so the rule can be checked without a database or a
 * form, the way `evaluateStageTransition` is.
 */
export interface SampleIdentParts {
  /** The one part an id cannot be built without. */
  place?: string | null;
  rockType?: string | null;
  nonProd?: string | null;
  sir?: string | null;
  pit?: string | null;
  bargingNo?: string | null;
  sequenceNo?: number | null;
  sampleNo?: number | null;
  sackCount?: number | null;
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function numeric(value: number | null | undefined): string | null {
  // 0 is a real number here, so only null/undefined/NaN drop out.
  return value == null || !Number.isFinite(value) ? null : String(value);
}

/**
 * Returns the composed id, or null when there is no place to hang it on.
 *
 * Only the place is required. Every other part is written when it is known and
 * simply left out when it is not, so a sample identified by nothing but its
 * place still gets an id — "MOL" — and gains segments as the rest is filled in.
 *
 * The cost is that the id is no longer reversible. The format is positional,
 * so dropping a part shifts the rest along: "LAM/TP" reads the same whether TP
 * is the rock type or the non-production code. That is a deliberate trade.
 * The nine columns on the record are what the sample actually is; this string
 * is the shorthand the lab writes on the sheet, and shorthand is allowed to be
 * lossy where the record behind it is not.
 */
export function composeSampleIdent(parts: SampleIdentParts): string | null {
  const place = text(parts.place);
  if (place === null) return null;

  const nonProd = text(parts.nonProd);
  const sir = text(parts.sir);
  const pit = text(parts.pit);
  const barging = text(parts.bargingNo)?.replace(/^B\.?/i, "") ?? null;
  const sequenceNo = numeric(parts.sequenceNo);
  const sampleNo = numeric(parts.sampleNo);

  // The two running numbers share one segment, joined by a dot. With only one
  // of them there is nothing to join, so it stands alone.
  const running =
    sequenceNo !== null && sampleNo !== null
      ? `${sequenceNo}.${sampleNo}`
      : (sequenceNo ?? sampleNo);

  const segments = [
    place,
    text(parts.rockType),
    nonProd,
    sir === null ? null : `S${sir}`,
    pit === null ? null : `P${pit}`,
    barging === null ? null : `B${barging}`,
    running,
    numeric(parts.sackCount),
  ];

  // Compared against null rather than filtered for truthiness: a sack count of
  // "0" is falsy, and `filter(Boolean)` would drop it without a word.
  return segments.filter((segment): segment is string => segment !== null).join("/");
}

/**
 * The ids that appear more than once in a list, in the order they first appear.
 *
 * One barcode carries one identity, so nothing makes the ids of a single
 * generate distinct any more — two blocks filled in the same way compose the
 * same id, and `sampleIdent` is unique. The database would catch it, but only
 * after the request had already been shaped, and with a message naming a
 * constraint rather than the two rows that clash.
 *
 * Nulls are not duplicates of each other: an identity too sparse to compose an
 * id is not a claim about which sample it is, so any number of them may sit in
 * one request.
 */
export function duplicateIdents(idents: readonly (string | null)[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const ident of idents) {
    if (ident === null) continue;
    if (seen.has(ident)) repeated.add(ident);
    seen.add(ident);
  }

  return [...repeated];
}

/** What sets a sub-sample apart, as written between the brackets: "-20". */
export const SUB_CODE_MAX = 32;

/**
 * A pasted key split into the record it names and, for a sub-sample, the
 * code in brackets after it.
 *
 *     "lam sap s4/b24/3475.3 ( -20 )"  ->  base  "LAM/SAP/S4/B24/3475.3"
 *                                           code  "-20"
 *                                           full  "LAM/SAP/S4/B24/3475.3 (-20)"
 *
 * Spaces and slashes are the same separator here: Sample IDs used to be
 * written with spaces and are stored with slashes, sheets still carry both,
 * and no master code may contain either, so reading one as the other can
 * never join two parts that belonged apart. A Lab Code keeps its own form
 * (`slashes: false`) -- only its bracketed sub code is peeled off.
 */
export function normalizeSampleKey(
  raw: string,
  { slashes = true }: { slashes?: boolean } = {}
): { base: string; code: string | null; full: string } {
  const text = raw.trim().toUpperCase();
  const bracket = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(text);
  const head = bracket ? bracket[1] : text;
  const code = bracket ? bracket[2].trim().replace(/\s+/g, " ") || null : null;

  const base = slashes
    ? head
        .replace(/[\s/]+/g, "/")
        .replace(/^\/+|\/+$/g, "")
    : head.trim();
  return { base, code, full: subKey(base, code) };
}

/** A sub-sample's Sample ID or Lab Code: its parent's, with the code in brackets. */
export function subKey(parent: string, code: string | null): string {
  return code ? `${parent} (${code})` : parent;
}

/**
 * A Sample ID without its sack count, the last segment of a full one.
 *
 * Sheets from the lab write the Sample ID without it -- the sacks are counted
 * at the stockpile, not at the bench -- so a pasted id is matched with the
 * count left out. Only a trailing count the record actually holds is dropped;
 * anything else is left as it is.
 */
export function withoutSacks(ident: string, sackCount: number | null | undefined): string {
  if (sackCount === null || sackCount === undefined) return ident;
  const suffix = `/${sackCount}`;
  return ident.endsWith(suffix) ? ident.slice(0, -suffix.length) : ident;
}

/**
 * Every key a record is found under when a sheet is pasted: its Sample ID as
 * stored, and the same without the sack count. A sub-sample keeps its code:
 * "…/3778.1/25 (-20)" is also found as "…/3778.1 (-20)".
 */
export function sampleIdentKeys(ident: string | null, sackCount: number | null | undefined): string[] {
  if (!ident) return [];
  const key = normalizeSampleKey(ident);
  return [...new Set([key.full, subKey(withoutSacks(key.base, sackCount), key.code)])];
}

/** The page of a sub-sample: under its sample's own page, by its code. */
export function subSamplePath(sampleCode: string, subCode: string): string {
  return `/samples/${encodeURIComponent(sampleCode)}/sub/${encodeURIComponent(subCode)}`;
}
