/**
 * Builds the Sample ID the lab writes on the sheet, e.g.
 *
 *     MOL LIM TP 3/A4/42/919.3/12
 *      │   │  │  │ │  │   │  │ └─ sacks
 *      │   │  │  │ │  │   │  └─ sample number
 *      │   │  │  │ │  │   └─ running number
 *      │   │  │  │ │  └─ barging run
 *      │   │  │  │ └─ pit
 *      │   │  │  └─ sir, the field stockpile it waited on
 *      │   │  └─ non-production code
 *      │   └─ rock type
 *      └─ place
 *
 * Two separators, not one. The leading group -- place, rock type,
 * non-production code, sir -- is what the material is and where it waited, and
 * is written with spaces. Everything from the pit onwards is written with "/".
 * That is the hand the lab writes it in.
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
 * so dropping a part shifts the rest along: "LAM TP" reads the same whether TP
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
  // The barging run is free text on the form, so it is the one part that could
  // carry a separator of its own inside it. A space or a slash there would read
  // as a segment boundary the record does not have and the id would stop being
  // findable at all, so neither survives into it.
  const barging = text(parts.bargingNo)?.replace(/^B\.?/i, "").replace(/[\s/]+/g, "") || null;
  const sequenceNo = numeric(parts.sequenceNo);
  const sampleNo = numeric(parts.sampleNo);

  // The two running numbers share one segment, joined by a dot. With only one
  // of them there is nothing to join, so it stands alone.
  const running =
    sequenceNo !== null && sampleNo !== null
      ? `${sequenceNo}.${sampleNo}`
      : (sequenceNo ?? sampleNo);

  // Compared against null rather than filtered for truthiness: a sack count of
  // "0" is falsy, and `filter(Boolean)` would drop it without a word.
  const kept = (segments: (string | null)[]) =>
    segments.filter((segment): segment is string => segment !== null);

  // The sir, the pit and the barging run are written as their codes alone.
  // They used to carry a letter each ("S3", "PA4", "B42"); ids stored then keep
  // it, and sheets that still write it are read by `legacyKeyReadings`.
  const group = kept([place, text(parts.rockType), nonProd, sir]).join(" ");

  const tail = kept([pit, barging, running, numeric(parts.sackCount)]);

  // The group is never empty -- the place is required -- so this is the group
  // on its own when nothing follows it.
  return [group, ...tail].join("/");
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
 * Spaces and slashes are the same separator here, so the key reads the same
 * whichever hand the id was written in. The stored id does not: it writes its
 * leading group with spaces, and `sampleIdentForms` is what turns a key back
 * into the few shapes the column could be holding. Sheets carry both hands,
 * and no master code may contain either separator, so reading one as the other
 * can never join two parts that belonged apart. A Lab Code keeps its own form
 * (`slashes: false`) -- only its bracketed sub code is peeled off.
 *
 * One key can answer two records now that the id writes two separators: a
 * numeric rock type makes "MOL 4" where a sack count makes "MOL/4", and both
 * read as the key "MOL/4". The unique index no longer rules that out. Callers
 * fall back rather than guess -- `resolvePastedKeys` says "ambiguous" and
 * `paste-map` marks the row clashing.
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
 * How many separators the leading group can hold: one before each of the rock
 * type, the non-production code and the sir.
 */
const GROUP_SEPARATORS_MAX = 3;

/**
 * Every way an all-slash key could have been written as a stored Sample ID.
 *
 *     "LAM/SAP/4/24/3475.3"  ->  "LAM/SAP/4/24/3475.3"
 *                                "LAM SAP/4/24/3475.3"
 *                                "LAM SAP 4/24/3475.3"   <- the stored one
 *                                "LAM SAP 4 24/3475.3"
 *
 * A key says which segments an id has but not which separator stood between
 * them, and the boundary cannot be read back out of the string: the format is
 * positional, and a rock type may be spelled like a sir. What saves this from
 * being a guess is that the group holds at most three separators and they are
 * always the first ones, so there are at most four shapes and the column holds
 * one of them. A caller ORs over the lot rather than deciding.
 *
 * `forms[0]` is the key itself, the shape an id with no group separators keeps.
 */
export function sampleIdentForms(base: string): string[] {
  const segments = base.split("/").filter(Boolean);
  if (segments.length === 0) return [];

  const forms: string[] = [];
  const most = Math.min(GROUP_SEPARATORS_MAX, segments.length - 1);
  for (let spaces = 0; spaces <= most; spaces += 1) {
    forms.push([segments.slice(0, spaces + 1).join(" "), ...segments.slice(spaces + 1)].join("/"));
  }
  return forms;
}

const RUNNING_SEGMENT = /^\d+(\.\d+)?$/;

/**
 * An all-slash key written the old way, with the sir, the pit and the barging
 * run each behind its letter, read as the id is composed now:
 *
 *     "MOL/SAP/SA4/PA11/B78/779.1"  ->  "MOL/SAP/A4/A11/78/779.1"
 *                                       "MOL/SAP/SA4/A11/78/779.1"
 *
 * Sheets from the lab still write the letters, so a pasted key is tried this
 * way when it names no record as it stands. The letters are only read where
 * the old id put them: walking back from the end past the running number and
 * the sack count, a "B" segment, then a "P" one, then an "S" one -- so a rock
 * type is never read past. A key with no number at its end is not read at
 * all, and the place, the first segment, never had a letter.
 *
 * The S cannot always be told from a rock type that starts with one: with
 * slashes throughout, "MOL/SAP/PA4/919.3" is the rock type SAP with no sir, or
 * the sir AP with no rock type. Both readings are given, the sir first, and
 * the caller takes the first that names a record. None when there was no
 * letter to drop.
 */
export function legacyKeyReadings(base: string): string[] {
  const segments = base.split("/");
  let at = segments.length - 1;
  while (at > 0 && RUNNING_SEGMENT.test(segments[at])) at -= 1;
  // Nothing after it to anchor the walk: "LAM/SAP" is a place and a rock type,
  // not a place and the sir "AP".
  if (at === segments.length - 1) return [];

  const lettered = (letter: string) => at > 0 && segments[at].length > 1 && segments[at].startsWith(letter);
  let dropped = false;
  for (const letter of ["B", "P"]) {
    if (lettered(letter)) {
      segments[at] = segments[at].slice(1);
      dropped = true;
      at -= 1;
    }
  }

  const readings: string[] = [];
  if (lettered("S")) readings.push(segments.map((segment, index) => (index === at ? segment.slice(1) : segment)).join("/"));
  if (dropped) readings.push(segments.join("/"));
  return readings;
}

/**
 * The same, for the piece of an id someone typed into a search box.
 *
 * A search term is not a whole id, so it is kept as it was typed as well: a
 * fragment the key reading would mangle -- "919.3", "(-20" -- is only ever
 * found raw. A term with no separator in it comes back as one form, so the
 * ordinary search costs no more than it did.
 */
export function searchIdentForms(raw: string): string[] {
  const term = raw.trim();
  if (!term) return [];

  const { base, code } = normalizeSampleKey(term);
  // An id typed with the old letters finds the record composed without them.
  const bases = base ? [base, ...legacyKeyReadings(base)] : [];
  const forms = bases.flatMap((each) => sampleIdentForms(each).map((form) => subKey(form, code)));
  return forms.includes(term.toUpperCase()) ? forms : [term, ...forms];
}

/**
 * A Sample ID without its sack count, the last segment of a full one.
 *
 * Sheets from the lab write the Sample ID without it -- the sacks are counted
 * at the stockpile, not at the bench -- so a pasted id is matched with the
 * count left out. Only a trailing count the record actually holds is dropped;
 * anything else is left as it is. The count is always in the slash tail, so
 * this reads a stored id and a key alike.
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

/** The page of one sample, in the lab module. */
export function samplePath(sampleCode: string): string {
  return `/lab/samples/${encodeURIComponent(sampleCode)}`;
}

/** The page of a sub-sample: under its sample's own page, by its code. */
export function subSamplePath(sampleCode: string, subCode: string): string {
  return `${samplePath(sampleCode)}/sub/${encodeURIComponent(subCode)}`;
}
