"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/core/components/ui/select";
import type { ApiResult } from "@/core/types";
import type { MasterKind, MasterOptionDTO } from "@/modules/lab/types";
import { withBasePath } from "@/core/lib/http/base-path";

/**
 * Picker for one master vocabulary, used by the dashboard and the two record
 * tables.
 *
 * One control for all five kinds rather than five near-identical copies: they
 * differ only in which list they read and what the "all" option is called, and
 * five copies would be five places for the behaviour to drift apart.
 */
export function MasterFilter({
  kind,
  value,
  onChange,
  className = "w-full sm:w-40",
}: {
  kind: MasterKind;
  value: string;
  onChange: (optionId: string | null) => void;
  className?: string;
}) {
  const t = useTranslations("masterData");
  const [options, setOptions] = useState<MasterOptionDTO[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(withBasePath(`/api/master-options?kind=${kind}&activeOnly=true`), {
          signal: controller.signal,
        });
        const result: ApiResult<{ options: MasterOptionDTO[] }> = await response.json();
        if (!result.success) return;
        setOptions(result.data.options);
      } catch {
        // The filter is optional; the table still works without it.
      }
    })();

    return () => controller.abort();
  }, [kind]);

  const all = t("allOf", { kind: t(`kind.${kind}`) });
  const labels: Record<string, string> = {
    ALL: all,
    ...Object.fromEntries(options.map((option) => [option.id, option.code])),
  };

  return (
    <Select
      value={value}
      items={labels}
      onValueChange={(next) => onChange(next === "ALL" ? null : next)}
    >
      <SelectTrigger className={className} aria-label={all}>
        <SelectValue>{(current) => labels[current as string] ?? ""}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">{all}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label ? `${option.code} — ${option.label}` : option.code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
