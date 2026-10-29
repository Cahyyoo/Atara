"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/core/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/core/components/ui/select";
import { apiFetch } from "@/core/lib/http/api-client";
import { IoReloadOutline } from "react-icons/io5";

/**
 * What the dashboard's sections share for their choices -- Oreas, Campaign
 * and Month Criteria: the Select itself, and asking the server again when a
 * choice changes.
 */

/** "Every one" in a Select, whose value cannot be empty. */
export const ALL = "ALL";

/** One labelled choice, as the lab's QC workbook has them above its tables. */
export function CriteriaSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const items = Object.fromEntries(options.map((option) => [option.value, option.label]));
  // The trigger is a button, so it is named by the label's id rather than left to `for`.
  return (
    <div className="flex flex-col gap-1.5">
      <Label id={`${id}-label`} htmlFor={id}>
        {label}
      </Label>
      <Select value={value} items={items} onValueChange={(next) => onChange(String(next ?? ALL))}>
        <SelectTrigger id={id} aria-labelledby={`${id}-label`} className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Shown beside the choices while the answer to a new one is on its way. */
export function CriteriaLoading() {
  const t = useTranslations("qcDashboard");
  return (
    <span className="flex items-center gap-1.5 pb-2 text-sm text-muted-foreground" role="status">
      <IoReloadOutline className="size-4 animate-spin" />
      {t("loading")}
    </span>
  );
}

/** A query string from the choices made, leaving out "every one". */
export function criteriaQuery(choices: Record<string, string>): string {
  return new URLSearchParams(Object.entries(choices).filter(([, value]) => value !== "" && value !== ALL)).toString();
}

/**
 * A section's data for the choices made (`query`): what came with the page
 * while they are the page's (`initialQuery`), otherwise the server's answer.
 * The last answer is kept with the question it answers, so the charts show
 * it once it matches what is asked and the previous ones until then.
 */
export function useCriteriaData<T>(path: string, query: string, initial: T, initialQuery: string) {
  const tCommon = useTranslations("common");
  const [answer, setAnswer] = useState<{ query: string; data?: T; error?: string } | null>(null);
  const [shown, setShown] = useState<T>(initial);
  const isInitial = query === initialQuery;

  useEffect(() => {
    if (isInitial) return;
    let live = true;
    void apiFetch<T>(`${path}?${query}`, { networkError: tCommon("networkError") }).then((outcome) => {
      if (!live) return;
      if (outcome.ok) {
        setShown(outcome.data);
        setAnswer({ query, data: outcome.data });
      } else {
        setAnswer({ query, error: outcome.error });
      }
    });
    return () => {
      live = false;
    };
  }, [path, query, isInitial, tCommon]);

  return {
    data: isInitial ? initial : shown,
    loading: !isInitial && answer?.query !== query,
    error: !isInitial && answer?.query === query ? (answer.error ?? null) : null,
  };
}
