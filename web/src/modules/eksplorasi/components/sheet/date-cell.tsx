"use client";

import type { BoxProps } from "@/modules/eksplorasi/components/sheet/sheet-grid";

/** What the Date box holds once a date is in it (use-data-source-sheet.ts turns "01/10/2026" into this). */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The browser's date field, dressed as the sheet's other boxes: its calendar
 * in the app's light or dark scheme, its icon small and quiet until the box
 * is pointed at or in use, and gone on a locked row, which cannot be changed.
 */
const DATE_FIELD =
  " tabular-nums tracking-tight [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-datetime-edit]:p-0" +
  " [&::-webkit-calendar-picker-indicator]:ml-0.5 [&::-webkit-calendar-picker-indicator]:size-3" +
  " [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-40" +
  " hover:[&::-webkit-calendar-picker-indicator]:opacity-100 focus:[&::-webkit-calendar-picker-indicator]:opacity-100" +
  " read-only:[&::-webkit-calendar-picker-indicator]:hidden";

/**
 * A row's Date: picked from a calendar rather than typed, so it cannot be
 * written the wrong way round. A value that is not a date -- another
 * column's, pasted one box over -- is shown as the text it is, for the check
 * to flag; emptied, the box is a date field again. One input throughout, so
 * the box keeps its focus as it turns from one into the other.
 */
export function DateCell({
  box,
  value,
  readOnly,
  className,
  onChange,
}: {
  box: BoxProps;
  value: string;
  readOnly: boolean;
  className: string;
  onChange: (value: string) => void;
}) {
  const isDate = value === "" || ISO_DATE.test(value);
  return (
    <input
      {...box}
      type={isDate ? "date" : "text"}
      autoComplete="off"
      readOnly={readOnly}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className + (isDate ? DATE_FIELD : " tabular-nums tracking-tight")}
    />
  );
}
