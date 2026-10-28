"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { BoxProps } from "@/modules/eksplorasi/components/sheet/sheet-grid";
import { looseMatch, PickerCell } from "@/modules/eksplorasi/components/sheet/picker-cell";

/**
 * The type of a row that can be changed: picked from the four sample types,
 * in the same searchable list as Remarks -- type "bla" and only Blank is left.
 * Text the list does not know (pasted, say) stays visible as its own choice,
 * and is marked by the server.
 */
export function TypeCell({
  typeLabels,
  ...cell
}: {
  box: BoxProps;
  value: string;
  typeLabels: readonly string[];
  disabled: boolean;
  className: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("dataSource.sheet");
  const [query, setQuery] = useState("");
  return (
    <PickerCell
      {...cell}
      items={typeLabels}
      query={query}
      onQueryChange={setQuery}
      filter={looseMatch}
      searchLabel={t("typeSearch")}
      emptyLabel={t("typeNoResults")}
    />
  );
}
