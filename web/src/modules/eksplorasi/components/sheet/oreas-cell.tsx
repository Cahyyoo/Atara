"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { BoxProps } from "@/modules/eksplorasi/components/sheet/sheet-grid";
import { looseMatch, PickerCell } from "@/modules/eksplorasi/components/sheet/picker-cell";

/**
 * The Remarks of the Data Source, Standard and Blank lists: an OREAS standard
 * from the CRM List, picked from a list that can be searched -- type "189"
 * and only Oreas189 is left. A few dozen names, all in the browser already.
 */
export function OreasCell({
  names,
  ...cell
}: {
  box: BoxProps;
  value: string;
  names: readonly string[];
  disabled: boolean;
  className: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("dataSource.sheet");
  const [query, setQuery] = useState("");
  return (
    <PickerCell
      {...cell}
      items={names}
      query={query}
      onQueryChange={setQuery}
      filter={looseMatch}
      searchLabel={t("oreasSearch")}
      emptyLabel={t("oreasNoResults")}
    />
  );
}
