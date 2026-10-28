"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { BoxProps } from "@/modules/eksplorasi/components/sheet/sheet-grid";
import { PickerCell } from "@/modules/eksplorasi/components/sheet/picker-cell";
import { useSampleIdSearch } from "@/modules/eksplorasi/components/sheet/use-sample-id-search";
import { SAMPLE_ID_SEARCH_LIMIT } from "@/modules/eksplorasi/validation";

/**
 * The Duplicate list's Remarks: the Sample ID of a FIELD sample in the data
 * source, picked from a list the server searches as it is typed in -- type
 * "0009" and DMY-A-00009 is there. Nothing is asked until the box is opened.
 */
export function SampleIdCell(cell: {
  box: BoxProps;
  value: string;
  disabled: boolean;
  className: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("dataSource.sheet");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { ids, loading, error, truncated } = useSampleIdSearch(open, query, tCommon("networkError"));

  const status = loading ? t("sampleIdLoading") : (error ?? (truncated ? t("sampleIdNarrow", { count: SAMPLE_ID_SEARCH_LIMIT }) : null));
  return (
    <PickerCell
      {...cell}
      items={ids}
      query={query}
      onQueryChange={setQuery}
      onOpenChange={setOpen}
      filter={null}
      searchLabel={t("sampleIdSearch")}
      emptyLabel={loading || error ? null : t("sampleIdNoResults")}
      status={status}
    />
  );
}
