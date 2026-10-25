import { normaliseHeader } from "@/core/lib/sheets/csv-parse";
import type { SheetColumn } from "@/core/lib/sheets/xlsx";

/**
 * The data source's columns, and which of them each menu shows -- in one
 * place for the list, the sheet, the export, the template and the importer,
 * so a file a menu writes is a file that menu reads back, and a header
 * renamed here is renamed everywhere at once.
 *
 * Pure: the browser reads the same lists.
 */

/** What a row is: a field sample, or one of the three QC checks among them. */
export const SAMPLE_TYPES = ["FIELD", "STANDARD", "BLANK", "DUPLICATE"] as const;
export type SampleType = (typeof SAMPLE_TYPES)[number];

/** The assayed elements and oxides, in the order the lab's sheets put them. */
export const ELEMENT_FIELDS = [
  "ni",
  "fe",
  "fe2o3",
  "co",
  "na2o",
  "mgo",
  "al2o3",
  "sio2",
  "p2o5",
  "so3",
  "k2o",
  "cao",
  "tio2",
  "cr2o3",
  "mno",
  "mc",
] as const;
export type ElementField = (typeof ELEMENT_FIELDS)[number];

/** How an element is written: the chemist's spelling, the same in every language. */
export const ELEMENT_LABELS: Record<ElementField, string> = {
  ni: "Ni",
  fe: "Fe",
  fe2o3: "Fe2O3",
  co: "Co",
  na2o: "Na2O",
  mgo: "MgO",
  al2o3: "Al2O3",
  sio2: "SiO2",
  p2o5: "P2O5",
  so3: "SO3",
  k2o: "K2O",
  cao: "CaO",
  tio2: "TiO2",
  cr2o3: "Cr2O3",
  mno: "MnO",
  mc: "MC",
};

/** Every column of a row, in the table's order. */
export const DATA_SOURCE_FIELDS = [
  "controlDate",
  "control",
  "campaign",
  "no",
  "holeId",
  "sampleId",
  "sampleType",
  "from",
  "to",
  "originalSampleIdRemarks",
  "oreasRemarks",
  "date",
  "weight",
  ...ELEMENT_FIELDS,
] as const;
export type DataSourceField = (typeof DATA_SOURCE_FIELDS)[number];

/** The plain text columns: everything but the type, the date and the elements. */
export const TEXT_FIELDS = [
  "controlDate",
  "control",
  "campaign",
  "no",
  "holeId",
  "sampleId",
  "from",
  "to",
  "originalSampleIdRemarks",
  "oreasRemarks",
  "weight",
] as const satisfies readonly DataSourceField[];

/** Longest text each column holds (eksplorasi.prisma). */
export const MAX_LENGTH: Record<Exclude<DataSourceField, "sampleType" | "date">, number> = {
  controlDate: 50,
  control: 100,
  campaign: 100,
  no: 50,
  holeId: 50,
  sampleId: 50,
  from: 20,
  to: 20,
  originalSampleIdRemarks: 500,
  oreasRemarks: 500,
  weight: 20,
  ...(Object.fromEntries(ELEMENT_FIELDS.map((field) => [field, 20])) as Record<ElementField, number>),
};

export const isElementField = (field: string): field is ElementField =>
  (ELEMENT_FIELDS as readonly string[]).includes(field);

/** What the export and the template write on row 1. */
export const HEADERS: Record<DataSourceField, string> = {
  controlDate: "Control Date",
  control: "Control",
  campaign: "Campaign",
  no: "No",
  holeId: "Hole ID",
  sampleId: "Sample ID",
  sampleType: "Sample Type",
  from: "From",
  to: "To",
  // Both are "Remarks" on screen and in a file: each list has only its own.
  originalSampleIdRemarks: "Remarks",
  oreasRemarks: "Remarks",
  date: "Date",
  weight: "Weight",
  ...ELEMENT_LABELS,
};

/**
 * The four lists. Each shows one sample type (the data source shows them all)
 * and the columns its sheet in the lab's workbook has; the elements follow
 * every one of them.
 */
export const DATA_SOURCE_VIEWS = ["dataSource", "standard", "blank", "duplicate"] as const;
export type DataSourceView = (typeof DATA_SOURCE_VIEWS)[number];

export interface ViewDefinition {
  /** The sample type the list is limited to; null for every type. */
  sampleType: SampleType | null;
  /** The columns before the elements. */
  leading: readonly DataSourceField[];
  /** Where the list lives. */
  path: string;
  /** The sheet's name in an exported workbook, and the file's. */
  sheetName: string;
  fileName: string;
}

export const VIEWS: Record<DataSourceView, ViewDefinition> = {
  dataSource: {
    sampleType: null,
    leading: ["campaign", "holeId", "sampleId", "sampleType", "from", "to", "oreasRemarks", "date", "weight"],
    path: "/eksplorasi/data-source",
    sheetName: "Data Source",
    fileName: "data-source",
  },
  standard: {
    sampleType: "STANDARD",
    leading: ["control", "campaign", "holeId", "sampleId", "oreasRemarks", "date", "weight"],
    path: "/eksplorasi/standard",
    sheetName: "Standard",
    fileName: "standard",
  },
  blank: {
    sampleType: "BLANK",
    leading: ["control", "campaign", "holeId", "sampleId", "sampleType", "oreasRemarks", "date", "weight"],
    path: "/eksplorasi/blank",
    sheetName: "Blank",
    fileName: "blank",
  },
  duplicate: {
    sampleType: "DUPLICATE",
    leading: [
      "controlDate",
      "control",
      "campaign",
      "no",
      "holeId",
      "sampleId",
      "sampleType",
      "originalSampleIdRemarks",
      "date",
      "weight",
    ],
    path: "/eksplorasi/duplicate",
    sheetName: "Duplicate",
    fileName: "duplicate",
  },
};

/** A view named in a query string, or the data source for anything else. */
export function viewOf(value: string | null | undefined): DataSourceView {
  return (DATA_SOURCE_VIEWS as readonly string[]).includes(value ?? "") ? (value as DataSourceView) : "dataSource";
}

/**
 * The column a list's Remarks is kept in: the Duplicate list's remarks are
 * about the original sample, the others' about the OREAS standards. A list
 * reads and writes only its own, so a remark typed on one list never
 * overwrites the other's.
 */
export function remarksFieldOf(view: DataSourceView): "originalSampleIdRemarks" | "oreasRemarks" {
  return view === "duplicate" ? "originalSampleIdRemarks" : "oreasRemarks";
}

/** A view's columns, in order: its own, then the elements. */
export function viewFields(view: DataSourceView): DataSourceField[] {
  return [...VIEWS[view].leading, ...ELEMENT_FIELDS];
}

/** The list a sample type belongs on: its own QC list, or the data source for a field sample. */
export function viewOfType(sampleType: SampleType): DataSourceView {
  const found = DATA_SOURCE_VIEWS.find((view) => VIEWS[view].sampleType === sampleType);
  return found ?? "dataSource";
}

/** A file's width for each column, in characters. */
const WIDTH: Partial<Record<DataSourceField, number>> = {
  controlDate: 13,
  control: 16,
  campaign: 14,
  no: 6,
  holeId: 12,
  sampleId: 14,
  sampleType: 12,
  from: 8,
  to: 8,
  originalSampleIdRemarks: 24,
  oreasRemarks: 24,
  date: 12,
  weight: 9,
};

/** The columns a view's export and template write. */
export function viewColumns(view: DataSourceView): (SheetColumn & { key: DataSourceField })[] {
  return viewFields(view).map((key) => ({ header: HEADERS[key], key, width: WIDTH[key] ?? 8 }));
}

/**
 * Every header the importer recognises, normalised (`normaliseHeader` drops
 * case, the bracketed unit and anything that is not a letter or digit). The
 * exported names first, then the usual spreadsheet spellings.
 */
const ALIASES: Record<Exclude<DataSourceField, "originalSampleIdRemarks" | "oreasRemarks">, string[]> = {
  controlDate: ["Control Date", "Tanggal Control", "Tanggal Kontrol", "QC Date"],
  control: ["Control", "Kontrol", "CRM", "Standard ID", "Original Sample", "Original Sample ID", "Parent"],
  campaign: ["Campaign", "Kampanye", "Program"],
  no: ["No", "No.", "Nomor", "Number", "Seq"],
  holeId: ["Hole ID", "HoleID", "Hole", "BHID", "DHID", "No Lubang"],
  sampleId: ["Sample ID", "SampleID", "Sample", "Sample No", "Sample Number", "Kode Sampel", "ID Sampel"],
  sampleType: ["Sample Type", "SampleType", "Type", "Tipe", "Tipe Sampel", "Jenis Sampel", "QC Type"],
  from: ["From", "Dari", "From (m)", "Depth From"],
  to: ["To", "Sampai", "Ke", "To (m)", "Depth To"],
  date: ["Date", "Tanggal", "Assay Date", "Tanggal Analisis"],
  weight: ["Weight", "Berat", "Wt"],
  ...(Object.fromEntries(ELEMENT_FIELDS.map((field) => [field, [ELEMENT_LABELS[field]]])) as Record<ElementField, string[]>),
};

const BY_HEADER = new Map<string, DataSourceField>(
  (Object.entries(ALIASES) as [DataSourceField, string[]][]).flatMap(([field, names]) =>
    names.map((name) => [normaliseHeader(name), field] as const)
  )
);

/** "Remarks" and its usual spellings: whichever remarks column the list keeps. */
const REMARKS = new Set(["Remarks", "Catatan", "Keterangan", "Notes", "Comment"].map(normaliseHeader));
/** The columns' own names, for a file that spells out which remarks it means. */
const NAMED_REMARKS = new Map<string, "originalSampleIdRemarks" | "oreasRemarks">([
  [normaliseHeader("Original Sample ID Remarks"), "originalSampleIdRemarks"],
  [normaliseHeader("original_sample_id_remarks"), "originalSampleIdRemarks"],
  [normaliseHeader("OREAS Remarks"), "oreasRemarks"],
  [normaliseHeader("oreas_remarks"), "oreasRemarks"],
]);

/**
 * The field a header names on a list, or null for a column the importer
 * ignores. A Remarks column is the list's own remarks (remarksFieldOf); one
 * that names the other list's remarks is ignored, so an import never writes
 * remarks a list does not show.
 */
export function fieldForHeader(header: string, view: DataSourceView = "dataSource"): DataSourceField | null {
  const key = normaliseHeader(header);
  if (REMARKS.has(key)) return remarksFieldOf(view);
  const named = NAMED_REMARKS.get(key);
  if (named) return named === remarksFieldOf(view) ? named : null;
  return BY_HEADER.get(key) ?? null;
}
