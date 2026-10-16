import "server-only";

import type { SessionPayload } from "@/core/lib/auth/auth";
import type { LabRecordDTO } from "@/modules/lab/types";
import { getLabSettings } from "@/modules/lab/lib/settings/lab-settings";

/**
 * Whether this caller is kept from seeing Sample IDs: a mobile-app session,
 * while the lab admin has the Sample ID hidden from the app. The website is
 * never affected, whatever the role.
 *
 * The client is read from the session row (requireSession), so a phone cannot
 * claim to be the website. The identity form's own endpoints do not ask this:
 * whoever fills a Sample ID in is shown what they are filling in.
 */
export async function hidesSampleIdent(session: SessionPayload): Promise<boolean> {
  if (session.client !== "MOBILE") return false;
  const settings = await getLabSettings();
  return !settings.mobileShowSampleIdent;
}

/** The identity columns that would spell the Sample ID back out. */
const IDENTITY_PARTS = [
  "placeId",
  "rockTypeId",
  "nonProdId",
  "pitId",
  "sirId",
  "bargingNo",
  "sequenceNo",
  "sampleNo",
  "sackCount",
] as const satisfies readonly (keyof LabRecordDTO)[];

export type VisibleLabRecord = LabRecordDTO & {
  /** Always sent, so the app knows a Sample ID exists even when it is not shown. */
  hasSampleIdent: boolean;
  /** True when the id and its parts were withheld from this caller. */
  identHidden: boolean;
};

/** A lab record as this caller may see it: whole, or without the Sample ID and its parts. */
export function visibleLabRecord(record: LabRecordDTO, hide: boolean): VisibleLabRecord {
  const hasSampleIdent = record.sampleIdent !== null;
  if (!hide) return { ...record, hasSampleIdent, identHidden: false };

  const blank = Object.fromEntries(IDENTITY_PARTS.map((part) => [part, null])) as {
    [K in (typeof IDENTITY_PARTS)[number]]: null;
  };
  return { ...record, ...blank, sampleIdent: null, hasSampleIdent, identHidden: true };
}

/** Any row carrying a Sample ID — a board card, a search hit — as this caller may see it. */
export function visibleIdent<T extends { sampleIdent: string | null }>(
  row: T,
  hide: boolean
): T & { hasSampleIdent: boolean } {
  return { ...row, sampleIdent: hide ? null : row.sampleIdent, hasSampleIdent: row.sampleIdent !== null };
}
