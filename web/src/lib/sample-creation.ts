import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateSampleCodes } from "@/lib/sample-code";
import { allocateLabCodes } from "@/lib/lab-code";
import { getShiftDate } from "@/lib/shift-date";
import { toLabRecordDTO } from "@/lib/lab-record";
import { sampleListInclude, toSampleListItemDTO } from "@/lib/sample-dto";
import { composeSampleIdent, duplicateIdents } from "@/lib/sample-ident";
import { ApiError } from "@/lib/api-response";

const MAX_ATTEMPTS = 3;

/** The allocation_locks row that serialises code allocation, across processes too. */
const CODE_LOCK = "sample-codes";

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** The nine identity columns, as the request sends them: ids and numbers. */
export interface SampleIdentityInput {
  placeId?: string | null;
  rockTypeId?: string | null;
  nonProdId?: string | null;
  pitId?: string | null;
  sirId?: string | null;
  bargingNo?: string | null;
  sequenceNo?: number | null;
  sampleNo?: number | null;
  sackCount?: number | null;
}

interface CreateSamplesInput {
  /**
   * One identity per sample, so the length of this list is the quantity. An
   * entry may be empty: that barcode is created unidentified rather than
   * refused, because one sometimes has to be printed before the barging run is
   * known.
   */
  identities: SampleIdentityInput[];
  createdById: string;
}

const OPTION_FIELDS = ["placeId", "rockTypeId", "nonProdId", "pitId", "sirId"] as const;

/**
 * Creates samples together with their lab record and SPR code in a single
 * transaction, so both code sequences are read and written atomically.
 * Concurrent requests can still collide on the unique keys; those are retried.
 *
 * Every code is known before anything is written, so the rows go in with two
 * `createMany` statements instead of one round-trip per sample. The transaction
 * is therefore four statements wide regardless of the quantity, and the read
 * that shapes the response happens after the commit.
 */
export async function createSamplesWithLabCodes(input: CreateSamplesInput) {
  const quantity = input.identities.length;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const sampleCodes = await prisma.$transaction(async (tx) => {
        // One generation at a time allocates codes. Both sequences are "read
        // the highest, add one", so concurrent generations used to read the
        // same highest and collide on the unique keys; three retries were
        // not enough when several people generated at once (12 of 15
        // parallel requests failed). The row lock is taken first and held
        // until this transaction commits, so the next generation's reads
        // (which start after it gets the lock) see every code issued here.
        const locked = await tx.$queryRaw<{ name: string }[]>`
          SELECT name FROM allocation_locks WHERE name = ${CODE_LOCK} FOR UPDATE`;
        if (locked.length === 0) {
          throw new Error(`allocation_locks has no "${CODE_LOCK}" row; run the migrations.`);
        }
        return allocateAndInsert(tx);
      }, { maxWait: 5_000, timeout: 30_000 });

      const samples = await prisma.sample.findMany({
        where: { sampleCode: { in: sampleCodes } },
        include: { ...sampleListInclude, labRecord: true },
        orderBy: { sampleCode: "asc" },
      });

      return samples.map((sample) => ({
        ...toSampleListItemDTO(sample),
        labRecord: sample.labRecord ? toLabRecordDTO(sample.labRecord) : null,
      }));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (attempt < MAX_ATTEMPTS && isUniqueConstraintError(error)) {
        continue;
      }
      throw error;
    }
  }

  // Unreachable: the loop either returns or rethrows on the final attempt.
  throw new Error("Sample creation exhausted its retries.");

  async function allocateAndInsert(tx: Prisma.TransactionClient): Promise<string[]> {
    const shiftDate = getShiftDate();

    // The composer works in codes, the request speaks in ids: one query
    // resolves every option any of the identities chose, no matter how many
    // of them name the same one.
    const ids = [
      ...new Set(
        input.identities.flatMap((identity) =>
          OPTION_FIELDS.map((field) => identity[field]).filter(
            (value): value is string => typeof value === "string"
          )
        )
      ),
    ];
    const options = ids.length
      ? await tx.masterOption.findMany({
          where: { id: { in: ids } },
          select: { id: true, code: true },
        })
      : [];
    const codeById = new Map(options.map((option) => [option.id, option.code]));
    const codeOf = (identity: SampleIdentityInput, field: (typeof OPTION_FIELDS)[number]) => {
      const id = identity[field];
      return id ? (codeById.get(id) ?? null) : null;
    };

    const idents = input.identities.map((identity) =>
      composeSampleIdent({
        place: codeOf(identity, "placeId"),
        rockType: codeOf(identity, "rockTypeId"),
        nonProd: codeOf(identity, "nonProdId"),
        pit: codeOf(identity, "pitId"),
        sir: codeOf(identity, "sirId"),
        bargingNo: identity.bargingNo,
        sequenceNo: identity.sequenceNo,
        sampleNo: identity.sampleNo,
        sackCount: identity.sackCount,
      })
    );

    // Two identities in one request can now compose the same id, which was
    // impossible while a single identity was multiplied and its sample
    // number ran. Caught before the database is asked anything: the unique
    // index would name whichever insert lost, not the pair to go and fix.
    const repeated = duplicateIdents(idents);
    if (repeated.length > 0) {
      throw new ApiError(
        `These Sample IDs are repeated within this request: ${repeated.join(", ")}. Nothing was created.`,
        409
      );
    }

    // Checked up front rather than left to the unique index. A clash here is
    // deterministic, not a race, so the retry below would compose the very
    // same id three times and then fail with something unreadable. Naming
    // the id that is already taken is the only useful answer.
    const wanted = idents.filter((value): value is string => value !== null);
    if (wanted.length > 0) {
      const taken = await tx.labRecord.findMany({
        where: { sampleIdent: { in: wanted } },
        select: { sampleIdent: true },
        orderBy: { sampleIdent: "asc" },
      });
      if (taken.length > 0) {
        const names = taken.map((row) => row.sampleIdent).join(", ");
        throw new ApiError(
          `${taken.length} of these Sample IDs already exist: ${names}. Nothing was created.`,
          409
        );
      }
    }

    // The year comes from the shift day, not the server's local calendar:
    // between 00:00 and 07:00 WITA on 1 January the two disagree.
    const codes = await generateSampleCodes(quantity, shiftDate.getUTCFullYear(), tx);
    const labCodes = await allocateLabCodes(tx, quantity, shiftDate);

    await tx.sample.createMany({
      data: codes.map((sampleCode) => ({
        sampleCode,
        status: "PENDING" as const,
        createdById: input.createdById,
      })),
    });

    // createMany cannot return the generated ids, so they are read back by
    // the codes we just assigned — still one statement, not one per row.
    const created = await tx.sample.findMany({
      where: { sampleCode: { in: codes } },
      select: { id: true, sampleCode: true },
    });
    const idByCode = new Map(created.map((sample) => [sample.sampleCode, sample.id]));

    await tx.labRecord.createMany({
      data: codes.map((sampleCode, index) => {
        // Positional throughout: the codes come back in the order they were
        // allocated, so row `index` belongs to identity `index`.
        const identity = input.identities[index];

        return {
          sampleId: idByCode.get(sampleCode)!,
          labCode: labCodes[index].labCode,
          shiftDate,
          sequence: labCodes[index].sequence,
          // Stored even when the id could not be composed: a half-filled
          // identity is still what is known about the sample.
          placeId: identity.placeId ?? null,
          rockTypeId: identity.rockTypeId ?? null,
          nonProdId: identity.nonProdId ?? null,
          pitId: identity.pitId ?? null,
          sirId: identity.sirId ?? null,
          bargingNo: identity.bargingNo ?? null,
          sequenceNo: identity.sequenceNo ?? null,
          sackCount: identity.sackCount ?? null,
          sampleNo: identity.sampleNo ?? null,
          sampleIdent: idents[index],
        };
      }),
    });

    return codes;
  }
}
