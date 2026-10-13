"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { usePersistedColumns } from "@/core/hooks/use-persisted-columns";
import type { InstrumentColumn } from "@/modules/lab/components/assay/results-grid";
import { ASSAY_ENTRY_FIELDS, ASSAY_FIELDS, INSTRUMENT_FIELDS } from "@/modules/lab/lib/records/assay";
import { ALL_COLUMNS, type Column } from "@/modules/lab/components/assay/results-entry-utils";

/**
 * The columns the entry screen shows, remembered per browser. The paste sheet
 * keeps its own choice (a different `storageKey`): a narrow sheet for pasting
 * three columns is not the grid somebody types eighteen into.
 */
export function useResultsColumns(storageKey = "atara.columns.assay.v2") {
  const tDatabase = useTranslations("database");

  /**
   * Opens on every assay column, and the key says v2 for that reason.
   *
   * The default used to be the five the database table shows, which is right
   * for reading and wrong here: thirteen of the eighteen were missing from the
   * one screen built for filling them in. Changing the default alone would
   * have reached nobody who had already been to this page -- a remembered
   * choice wins over a fallback, and every remembered choice was made under
   * the old one. So the key moves, the choice is forgotten once, and anyone
   * who wants fewer columns can narrow them again from the picker.
   */
  const [visible, setVisible] = usePersistedColumns<Column>(
    storageKey,
    ASSAY_ENTRY_FIELDS,
    ALL_COLUMNS
  );
  const columns = useMemo(() => ASSAY_FIELDS.filter((field) => visible.includes(field.key)), [visible]);
  const instrumentColumns = useMemo<InstrumentColumn[]>(
    () =>
      INSTRUMENT_FIELDS.filter((field) => visible.includes(field.key)).map((field) => ({
        ...field,
        label: tDatabase(field.key),
      })),
    [visible, tDatabase]
  );
  const showRemarks = visible.includes("remarks");

  function toggleColumn(column: Column) {
    setVisible(visible.includes(column) ? visible.filter((key) => key !== column) : [...visible, column]);
  }

  return { visible, setVisible, columns, instrumentColumns, showRemarks, toggleColumn };
}
