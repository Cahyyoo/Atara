import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type ExcelJS from "exceljs";
import { APP_NAME, BRAND_LOGO_SRC } from "@/core/lib/app/brand";
import { formatWitaDateTime } from "@/core/lib/wita-time";
import type { SheetColumn } from "@/core/lib/sheets/xlsx";

/** The logo on disk: BRAND_LOGO_SRC is a URL under public/. */
const LOGO_FILE = path.join(process.cwd(), "public", ...BRAND_LOGO_SRC.split("/").filter(Boolean));

let logo: Promise<Buffer | null> | null = null;

/**
 * The logo's bytes, read once per process. A missing file is not cached, so
 * putting it back takes effect without a restart; the exports carry on with
 * the title alone meanwhile.
 */
export function readBrandLogo(): Promise<Buffer | null> {
  logo ??= readFile(LOGO_FILE).catch(() => {
    logo = null;
    return null;
  });
  return logo;
}

/** Rows 1-3 carry the logo and title, row 4 is a gap, the table starts on row 5. */
export const BRANDED_HEADER_ROW = 5;

/** Drawn this tall, the logo spans the three banner rows. */
const LOGO_HEIGHT_PX = 84;
const BANNER_ROW_HEIGHT_PT = 22;

/** Excel's own rule of thumb for a column `width` (in characters) in pixels. */
function columnPixels(width: number): number {
  return Math.round(width * 7 + 5);
}

/** A row height in points, in screen pixels (96 dpi). */
function rowPixels(heightPt: number): number {
  return (heightPt * 96) / 72;
}

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * A PNG's pixel size, from its IHDR chunk. The logo's proportions come from
 * the file itself, so a replacement logo of another shape is not squashed.
 * Square when the bytes are not a PNG.
 */
export function pngSize(bytes: Uint8Array): ImageSize {
  const isPng = bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (!isPng) return { width: 1, height: 1 };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : { width: 1, height: 1 };
}

/** DrawingML measures in EMUs: 9525 to a pixel at 96 dpi. */
const EMU_PER_PIXEL = 9525;

/**
 * Where a pixel offset lands: which column (or row), and how far into it in
 * EMUs.
 *
 * Given to ExcelJS as a native anchor, not as a fractional `col`: it turns
 * a fraction into an offset by taking a column as `width * 10000` EMUs, about
 * a seventh of its real width, which left a "centred" logo hugging the left.
 */
function nativeAnchor(offset: number, sizes: readonly number[]): { index: number; offsetEmu: number } {
  let remaining = offset;
  for (let index = 0; index < sizes.length; index++) {
    if (remaining < sizes[index]) return { index, offsetEmu: Math.round(remaining * EMU_PER_PIXEL) };
    remaining -= sizes[index];
  }
  return { index: sizes.length, offsetEmu: 0 };
}

/**
 * Draws an image as large as fits in the box made by the first columns and
 * rows given, at its own proportions and centred in it.
 *
 * Anchoring an image to a cell range ("A1:B4") instead stretches it to fill
 * the range, which turned the round logo on the analysis form into an oval as
 * wide as the No. and Sample columns.
 */
export function placeImageInBox(
  sheet: ExcelJS.Worksheet,
  imageId: number,
  {
    size,
    columnWidths,
    rowHeightsPt,
    padding = 4,
  }: { size: ImageSize; columnWidths: readonly number[]; rowHeightsPt: readonly number[]; padding?: number }
): { width: number; height: number; left: number; top: number } {
  const columns = columnWidths.map(columnPixels);
  const rows = rowHeightsPt.map(rowPixels);
  const boxWidth = columns.reduce((sum, value) => sum + value, 0);
  const boxHeight = rows.reduce((sum, value) => sum + value, 0);

  const scale = Math.max(
    0,
    Math.min((boxWidth - 2 * padding) / size.width, (boxHeight - 2 * padding) / size.height)
  );
  const width = Math.round(size.width * scale);
  const height = Math.round(size.height * scale);
  const left = (boxWidth - width) / 2;
  const top = (boxHeight - height) / 2;

  const column = nativeAnchor(left, columns);
  const row = nativeAnchor(top, rows);
  sheet.addImage(imageId, {
    // The typings only know the fractional form; ExcelJS's Anchor takes this too.
    tl: {
      nativeCol: column.index,
      nativeColOff: column.offsetEmu,
      nativeRow: row.index,
      nativeRowOff: row.offsetEmu,
    } as unknown as ExcelJS.Anchor,
    ext: { width, height },
    editAs: "oneCell",
  });
  return { width, height, left, top };
}

function widthOf(column: SheetColumn): number {
  return column.width ?? Math.max(12, column.header.length + 2);
}

/**
 * Lays out a branded table on an in-memory sheet: the logo top-left, the
 * title beside it with when it was exported, then the column headers on
 * BRANDED_HEADER_ROW -- bold, frozen, with a filter, like the plain exports
 * had on row 1. Rows added afterwards with `sheet.addRow(row)` land under it,
 * matched to the columns by key.
 *
 * In-memory only: the streaming writer can store an image but not place one.
 */
export function writeBrandedHeader(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  { title, columns, logo: logoBytes }: { title: string; columns: SheetColumn[]; logo: Buffer | null }
): void {
  sheet.columns = columns.map((column) => ({ key: column.key, width: widthOf(column) }));

  for (let row = 1; row <= 3; row++) sheet.getRow(row).height = BANNER_ROW_HEIGHT_PT;

  // The title starts in the first column clear of the logo.
  let titleColumn = 1;
  if (logoBytes) {
    const imageId = workbook.addImage({
      buffer: logoBytes as unknown as ExcelJS.Buffer,
      extension: "png",
    });
    const size = pngSize(logoBytes);
    const logoWidth = Math.round((LOGO_HEIGHT_PX * size.width) / size.height);
    sheet.addImage(imageId, {
      tl: { col: 0.1, row: 0.1 },
      ext: { width: logoWidth, height: LOGO_HEIGHT_PX },
      editAs: "oneCell",
    });
    let covered = 0;
    while (titleColumn <= columns.length && covered < logoWidth + 12) {
      covered += columnPixels(widthOf(columns[titleColumn - 1]));
      titleColumn += 1;
    }
    // A one- or two-column export still gets its title, beside the last column.
    titleColumn = Math.min(titleColumn, Math.max(columns.length + 1, 2));
  }

  const heading = sheet.getCell(1, titleColumn);
  heading.value = title;
  heading.font = { size: 14, bold: true };
  heading.alignment = { vertical: "bottom" };

  const exported = sheet.getCell(2, titleColumn);
  exported.value = `${APP_NAME} · Exported ${formatWitaDateTime(new Date())} WITA`;
  exported.font = { size: 10, color: { argb: "FF6B7280" } };
  exported.alignment = { vertical: "top" };

  const header = sheet.getRow(BRANDED_HEADER_ROW);
  header.values = columns.map((column) => column.header);
  header.font = { bold: true };

  sheet.views = [{ state: "frozen", ySplit: BRANDED_HEADER_ROW }];
  sheet.autoFilter = {
    from: { row: BRANDED_HEADER_ROW, column: 1 },
    to: { row: BRANDED_HEADER_ROW, column: Math.max(columns.length, 1) },
  };
}
