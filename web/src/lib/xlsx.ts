export interface SheetColumn {
  header: string;
  key: string;
  width?: number;
}

export type SheetRow = Record<string, string | number | null>;

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
