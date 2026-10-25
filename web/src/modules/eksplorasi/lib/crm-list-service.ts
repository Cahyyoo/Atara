import "server-only";
import { prisma } from "@/core/lib/prisma";
import { ApiError } from "@/core/lib/http/api-response";
import { blankToNull } from "@/modules/eksplorasi/lib/data-source";
import { CRM_COLUMNS, crmFields, isCrmKind, type CrmKind } from "@/modules/eksplorasi/lib/crm-list-columns";
import type { CrmRowDTO } from "@/modules/eksplorasi/types";

/**
 * The CRM List as the API serves it: three small reference tables, each read
 * whole and changed a row at a time. The routes check who is asking and what
 * was sent, and call these.
 *
 * A name already taken -- the same standard and test method twice, or a
 * second "Preferred Value" -- is a 409, and a row that is gone a 404, both
 * from handleApiError (P2002, P2025).
 */

/** standard, blank or duplicate, from the API path; any other name is a table that does not exist. */
export function crmKindOf(kind: string): CrmKind {
  if (!isCrmKind(kind)) throw new ApiError("No such CRM table.", 404);
  return kind;
}

type Row = { id: string; updatedAt: Date } & Record<string, unknown>;

/**
 * What the service asks of each table. The three delegates differ only in the
 * columns, which crm-list-columns.ts describes, so they are used through this
 * one shape instead of a switch per operation.
 */
interface CrmTable {
  findMany(args: { orderBy: Record<string, "asc" | "desc">[]; take: number }): Promise<Row[]>;
  create(args: { data: Record<string, unknown> }): Promise<Row>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<Row>;
  delete(args: { where: { id: string } }): Promise<Row>;
}

const TABLES: Record<CrmKind, CrmTable> = {
  standard: prisma.crmStandard as unknown as CrmTable,
  blank: prisma.crmBlank as unknown as CrmTable,
  duplicate: prisma.crmDuplicate as unknown as CrmTable,
};

/**
 * The order the lab's sheet keeps: standards grouped by name, each in the
 * order its methods were added (XRF before ICP in the seed); the other two in
 * the order they were added.
 */
const ORDER: Record<CrmKind, Record<string, "asc">[]> = {
  standard: [{ standard: "asc" }, { createdAt: "asc" }],
  blank: [{ createdAt: "asc" }],
  duplicate: [{ createdAt: "asc" }],
};

/** A reference table, not a log: a few dozen rows. The cap is only a guard. */
const MAX_ROWS = 500;

function toDTO(kind: CrmKind, row: Row): CrmRowDTO {
  return {
    ...Object.fromEntries(crmFields(kind).map((field) => [field, (row[field] as string | null) ?? null])),
    id: row.id,
    updatedAt: row.updatedAt.toISOString(),
  } as CrmRowDTO;
}

/** The sent fields as the database stores them: trimmed, blank text as no text. */
function columns(kind: CrmKind, body: Record<string, string | null | undefined>) {
  return Object.fromEntries(
    CRM_COLUMNS[kind].flatMap((column) => {
      const value = body[column.field];
      if (value === undefined) return [];
      return [[column.field, column.key ? value : blankToNull(value)]];
    })
  );
}

export async function listCrm(kind: CrmKind): Promise<CrmRowDTO[]> {
  const rows = await TABLES[kind].findMany({ orderBy: ORDER[kind], take: MAX_ROWS });
  return rows.map((row) => toDTO(kind, row));
}

export async function createCrm(kind: CrmKind, body: Record<string, string | null | undefined>, userId: string) {
  const row = await TABLES[kind].create({ data: { ...columns(kind, body), createdById: userId } });
  return toDTO(kind, row);
}

/** Changes only the fields sent. */
export async function updateCrm(
  kind: CrmKind,
  id: string,
  body: Record<string, string | null | undefined>,
  userId: string
) {
  const row = await TABLES[kind].update({ where: { id }, data: { ...columns(kind, body), updatedById: userId } });
  return toDTO(kind, row);
}

/** Removed outright: nothing refers to a CRM row. */
export async function deleteCrm(kind: CrmKind, id: string) {
  await TABLES[kind].delete({ where: { id } });
  return { id };
}
