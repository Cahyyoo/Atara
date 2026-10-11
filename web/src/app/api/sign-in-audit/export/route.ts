import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { exportResponse, EXPORT_ROW_LIMIT } from "@/lib/export-response";
import {
  SIGN_IN_OUTCOMES,
  signInAuditWhere,
  type SignInAuditFilters,
  type SignInOutcomeName,
} from "@/lib/sign-in-audit-query";
import { formatWitaDateTime } from "@/lib/shift-date";
import type { SheetRow } from "@/lib/xlsx";

/**
 * The trail, as a file.
 *
 * An audit that cannot be handed to somebody outside the app is half an audit:
 * the question "show me who signed in without a second factor last month" is
 * normally asked by a person who does not have a login here.
 */

/** Read a page at a time so neither the query nor the response holds everything. */
const PAGE_SIZE = 2_000;

/** Narrows the raw query string without trusting it. */
function outcomeParam(value: string | null): SignInOutcomeName | undefined {
  return SIGN_IN_OUTCOMES.find((outcome) => outcome === value);
}

export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "viewSignInAudit");

    const { searchParams } = new URL(request.url);
    // The same filters the table applies, read the same way and handed to the
    // same builder. A download that quietly covers a different set than the
    // rows it was started from is the failure this shares code to avoid.
    const filters: SignInAuditFilters = {
      userId: searchParams.get("userId") ?? undefined,
      outcome: outcomeParam(searchParams.get("outcome")),
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    };
    const where = signInAuditWhere(filters);

    // Before a single byte is written: once the stream opens, the status is
    // already sent and this can no longer be a 413.
    const total = await prisma.signInAudit.count({ where });
    if (total > EXPORT_ROW_LIMIT) {
      throw new ApiError(
        `This export would contain ${total} rows. Narrow the filters to at most ${EXPORT_ROW_LIMIT}.`,
        413
      );
    }

    const columns = [
      { header: "Signed In At", key: "createdAt", width: 22 },
      { header: "Name", key: "name", width: 24 },
      { header: "Email", key: "email", width: 30 },
      { header: "Outcome", key: "outcome", width: 20 },
      // Kept as separate columns rather than folded into the outcome, so the
      // sheet can be filtered on the one question the trail exists to answer.
      { header: "Face Verified", key: "faceVerified", width: 14 },
      { header: "Authenticator Verified", key: "totpVerified", width: 22 },
      { header: "Address", key: "address", width: 20 },
    ];

    async function* rows(): AsyncIterable<SheetRow> {
      let cursor: string | undefined;

      for (;;) {
        const page = await prisma.signInAudit.findMany({
          where,
          select: {
            id: true,
            createdAt: true,
            outcome: true,
            faceVerified: true,
            totpVerified: true,
            address: true,
            user: { select: { name: true, email: true } },
          },
          // id breaks ties, so paging cannot skip or repeat a row when two
          // attempts share a timestamp.
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: PAGE_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        if (page.length === 0) return;

        for (const entry of page) {
          yield {
            // On the lab's clock, like every other timestamp the lab reads.
            createdAt: formatWitaDateTime(entry.createdAt),
            name: entry.user.name,
            email: entry.user.email,
            outcome: entry.outcome,
            faceVerified: entry.faceVerified ? "Yes" : "",
            totpVerified: entry.totpVerified ? "Yes" : "",
            // Blank rather than a guess: without TRUST_PROXY there is no
            // address this deployment can vouch for.
            address: entry.address,
          };
        }

        if (page.length < PAGE_SIZE) return;
        cursor = page[page.length - 1].id;
      }
    }

    return exportResponse({
      format: searchParams.get("format"),
      sheetName: "Sign-in Audit",
      baseFilename: "sign-in-audit",
      columns,
      rows,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
