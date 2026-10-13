import { useCallback, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/core/components/ui/select";
import { cn } from "@/core/lib/utils";
import {
  clampCopies,
  LABELS_PER_SHEET,
  LABEL_COLUMN_OPTIONS,
  MAX_COPIES,
  type LabelColumns,
} from "@/modules/lab/components/samples/print-label-grid";

const STORAGE_KEY = "atara.labelPrint";

/** Past this the hint turns amber: it is a lot of paper to commit to by accident. */
const MANY_LABELS = 500;

export interface LabelPrintSettings {
  copies: number;
  columns: LabelColumns;
}

const DEFAULT_SETTINGS: LabelPrintSettings = { copies: 1, columns: 3 };

/*
 * The remembered layout lives in a tiny module-level store rather than in
 * component state. localStorage does not exist while the page is rendered on
 * the server, so the value has to arrive after mount — and going through
 * useSyncExternalStore does that without writing state from an effect, and
 * without the two bulk pages drifting apart from each other.
 */
let snapshot: LabelPrintSettings = DEFAULT_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

function readStoredSettings(): LabelPrintSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const saved = JSON.parse(raw) as { copies?: number; columns?: number };
    return {
      copies: typeof saved.copies === "number" ? clampCopies(saved.copies) : 1,
      columns: LABEL_COLUMN_OPTIONS.some((option) => option === saved.columns)
        ? (saved.columns as LabelColumns)
        : 3,
    };
  } catch {
    // A corrupt or blocked value just means the defaults are used.
    return DEFAULT_SETTINGS;
  }
}

function subscribe(listener: () => void): () => void {
  // React re-reads the snapshot right after subscribing, so hydrating here is
  // what gets the stored value on screen.
  if (!loaded) {
    loaded = true;
    snapshot = readStoredSettings();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function writeSettings(next: LabelPrintSettings) {
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota: the setting is simply not remembered.
  }
  for (const listener of listeners) listener();
}

/**
 * Remembers the sheet layout between runs. An operator prints with one label
 * stock all shift, so re-picking every time is exactly the friction this is
 * meant to remove. Both bulk surfaces share one key — it is one preference.
 */
export function useLabelPrintSettings() {
  const settings = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => DEFAULT_SETTINGS
  );

  // Stored unclamped so the field can be cleared and retyped; the grid clamps
  // what it renders, and the control snaps the field back on blur.
  const setCopies = useCallback((copies: number) => {
    writeSettings({ ...snapshot, copies });
  }, []);

  const setColumns = useCallback((columns: LabelColumns) => {
    writeSettings({ ...snapshot, columns });
  }, []);

  return { copies: settings.copies, columns: settings.columns, setCopies, setColumns };
}

interface LabelPrintControlsProps {
  copies: number;
  onCopiesChange: (copies: number) => void;
  /** Pass both to show the density picker; omit on the single-label surface. */
  columns?: LabelColumns;
  onColumnsChange?: (columns: LabelColumns) => void;
  /** samples × copies. Omit to hide the sheet hint. */
  totalLabels?: number;
  /** Header variant: no visible labels, no hint, narrow input. */
  compact?: boolean;
}

export function LabelPrintControls({
  copies,
  onCopiesChange,
  columns,
  onColumnsChange,
  totalLabels,
  compact = false,
}: LabelPrintControlsProps) {
  const t = useTranslations("samples.printOptions");
  const showColumns = columns !== undefined && onColumnsChange !== undefined;
  const columnItems = Object.fromEntries(
    LABEL_COLUMN_OPTIONS.map((option) => [String(option), t("perRowValue", { count: option })])
  );

  const sheets =
    totalLabels === undefined
      ? 0
      : Math.ceil(totalLabels / LABELS_PER_SHEET[columns ?? 3]);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className={compact ? "flex flex-col" : "flex w-full flex-col gap-1.5 sm:w-24"}>
        {compact ? null : <Label htmlFor="labelCopies">{t("copies")}</Label>}
        <Input
          id="labelCopies"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_COPIES}
          aria-label={t("copies")}
          className={compact ? "h-9 w-16" : undefined}
          value={copies}
          onChange={(event) => onCopiesChange(Number(event.target.value))}
          // Snaps the field back to what the preview is actually showing.
          onBlur={(event) => onCopiesChange(clampCopies(Number(event.target.value)))}
        />
      </div>

      {showColumns ? (
        <div className="flex w-full flex-col gap-1.5 sm:w-36">
          <Label htmlFor="labelColumns">{t("perRow")}</Label>
          <Select
            value={String(columns)}
            items={columnItems}
            onValueChange={(value) => onColumnsChange(Number(value) as LabelColumns)}
          >
            <SelectTrigger id="labelColumns" className="w-full" aria-label={t("perRow")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LABEL_COLUMN_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {t("perRowValue", { count: option })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {/* Nothing selected yet has nothing useful to say about sheets. */}
      {!compact && totalLabels !== undefined && totalLabels > 0 ? (
        <p
          className={cn(
            "pb-2 text-xs",
            totalLabels > MANY_LABELS
              ? "font-medium text-amber-600 dark:text-amber-500"
              : "text-muted-foreground"
          )}
        >
          {t("sheetHint", { total: totalLabels, sheets })}
        </p>
      ) : null}
    </div>
  );
}
