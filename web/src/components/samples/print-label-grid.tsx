import { forwardRef, memo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import type { SampleListItemDTO } from "@/types";

export type LabelColumns = 3 | 4 | 5;

export const LABEL_COLUMN_OPTIONS = [3, 4, 5] as const;

/** One sheet already overflows at every density, so beyond this it is a bulk run. */
export const MAX_COPIES = 50;

/** Roughly how many labels fit one A4 sheet at 12mm margins, for the sheet hint. */
export const LABELS_PER_SHEET: Record<LabelColumns, number> = { 3: 18, 4: 28, 5: 40 };

/**
 * Per-density layout. The grid classes must stay written out in full: Tailwind
 * only emits a class it can find as a complete literal in a source file, so
 * `grid-cols-${columns}` would silently render an unstyled one-column grid.
 *
 * The QR size stays in fixed px rather than going fluid. In the print context a
 * CSS pixel is exactly 1/96in, so `96` is guaranteed 25.4mm on paper whatever
 * the viewport is; a percentage width would resolve against the preview card on
 * screen and against the page box on paper, giving two different labels.
 *
 * The code text shrinks with the column count because a 14-character sample code
 * at text-xs is about 101px wide and the five-column content box is only 105px.
 */
const LAYOUT: Record<LabelColumns, { grid: string; qr: number; code: string }> = {
  3: { grid: "grid-cols-3", qr: 96, code: "text-xs" },
  4: { grid: "grid-cols-4", qr: 80, code: "text-[11px]" },
  5: { grid: "grid-cols-5", qr: 64, code: "text-[10px]" },
};

/** A number input can hold "", "abc" or "999"; the grid never renders those. */
export function clampCopies(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.trunc(value), 1), MAX_COPIES);
}

interface PrintLabelGridProps {
  samples: SampleListItemDTO[];
  /** How many identical labels to print per sample, so one sheet can cover a set. */
  copies?: number;
  columns?: LabelColumns;
}

/**
 * Memoised: QR encoding is real work, and the parent re-renders on every
 * keystroke in its search box while up to 50 labels are selected.
 */
export const PrintLabelGrid = memo(
  forwardRef<HTMLDivElement, PrintLabelGridProps>(function PrintLabelGrid(
    { samples, copies = 1, columns = 3 },
    ref
  ) {
    const layout = LAYOUT[columns] ?? LAYOUT[3];
    const count = clampCopies(copies);

    return (
      // The padding is preview chrome; on paper it would cost ~8.5mm of width.
      <div ref={ref} className={cn("print-label-grid grid gap-3 bg-white p-4 print:p-0", layout.grid)}>
        {samples.flatMap((sample) =>
          Array.from({ length: count }, (_, index) => (
            <div
              key={`${sample.id}-${index}`}
              className="flex flex-col items-center gap-1.5 rounded-md border border-black/20 p-3 text-center"
            >
              <QRCodeSVG value={sample.sampleCode} size={layout.qr} level="M" />
              <p className={cn("font-mono font-semibold tracking-wide text-black", layout.code)}>
                {sample.sampleCode}
              </p>
            </div>
          ))
        )}
      </div>
    );
  })
);
