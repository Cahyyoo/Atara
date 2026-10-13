"use client";

import { useCallback } from "react";
import { useFormatter } from "next-intl";
import { parseDayInput } from "@/core/lib/wita-time";

/** A shift date as the table and the record panel show it. */
export function useFormatShiftDate() {
  const format = useFormatter();
  return useCallback(
    (shiftDate: string) => {
      const date = parseDayInput(shiftDate);
      // Shift dates are midnight UTC of the day; formatting in UTC keeps the day.
      return date ? format.dateTime(date, { dateStyle: "medium", timeZone: "UTC" }) : shiftDate;
    },
    [format]
  );
}
