/**
 * The CRM List: the reference values the QC samples are judged against, kept
 * in three tables -- one per check -- and shown together on one page.
 *
 * The one description of each table's columns, read by the validation, the
 * service, the page and the backup alike, so a column added here is added
 * everywhere. No server imports: the browser reads it too.
 */
import { ELEMENT_LABELS } from "@/modules/eksplorasi/lib/data-source-columns";

export const CRM_KINDS = ["standard", "blank", "duplicate"] as const;
export type CrmKind = (typeof CRM_KINDS)[number];

export const isCrmKind = (value: string): value is CrmKind => (CRM_KINDS as readonly string[]).includes(value);

/** A column of a CRM table: its field, its heading, and how long it may be. */
export interface CrmColumn {
  field: string;
  /** The heading as the lab writes it; chemistry reads the same in every language. */
  header: string;
  maxLength: number;
  /** Part of what names the row: required, and unique together with the others. */
  key?: true;
}

/** Elements the standards are certified for, in the lab's sheet order. */
const STANDARD_ELEMENTS = ["ni", "co", "fe2o3", "al2o3", "cr2o3", "mgo", "sio2"] as const;
const BLANK_ELEMENTS = ["ni", "co", "fe2o3", "cr2o3"] as const;

/** "sdNi" for "ni": the field of an element's standard deviation. */
const sdField = (element: string) => `sd${element.charAt(0).toUpperCase()}${element.slice(1)}`;

const VALUE_LENGTH = 20;

export const CRM_COLUMNS: Record<CrmKind, readonly CrmColumn[]> = {
  standard: [
    { field: "standard", header: "Standart", maxLength: 50, key: true },
    { field: "testMethod", header: "Test Method", maxLength: 50, key: true },
    ...STANDARD_ELEMENTS.map((element) => ({ field: element, header: ELEMENT_LABELS[element], maxLength: VALUE_LENGTH })),
    ...STANDARD_ELEMENTS.map((element) => ({
      field: sdField(element),
      header: `SD ${ELEMENT_LABELS[element]}`,
      maxLength: VALUE_LENGTH,
    })),
  ],
  blank: [
    { field: "label", header: "Blanks", maxLength: 50, key: true },
    ...BLANK_ELEMENTS.map((element) => ({ field: element, header: ELEMENT_LABELS[element], maxLength: VALUE_LENGTH })),
  ],
  duplicate: [
    { field: "label", header: "Duplicate", maxLength: 50, key: true },
    { field: "r2", header: "R²", maxLength: VALUE_LENGTH },
    { field: "rpd", header: "RPD %", maxLength: VALUE_LENGTH },
    { field: "overRpd", header: ">10% RPD", maxLength: VALUE_LENGTH },
  ],
};

/** The fields of a kind's table, in order. */
export const crmFields = (kind: CrmKind) => CRM_COLUMNS[kind].map((column) => column.field);

/** The fields that name a row of a kind's table. */
export const crmKeyFields = (kind: CrmKind) =>
  CRM_COLUMNS[kind].filter((column) => column.key).map((column) => column.field);

/** The name of a backup sheet, and of a table's card. */
export const CRM_SHEET_NAMES: Record<CrmKind, string> = {
  standard: "CRM Standart",
  blank: "CRM Blank",
  duplicate: "CRM Duplicate",
};
