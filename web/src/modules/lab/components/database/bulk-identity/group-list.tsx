"use client";

import { memo, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/core/components/ui/input";
import { Badge } from "@/core/components/ui/badge";
import { cn } from "@/core/lib/utils";
import type { Group, Mark } from "@/modules/lab/components/database/bulk-identity/identity-plan";

/**
 * The Sample IDs, one button each, marked once their form changes. Its own
 * memoised component: typing redraws it only when a mark changes.
 */
export const GroupList = memo(function GroupList({
  groups,
  marks,
  visible,
  active,
  tools,
  query,
  onlyChanged,
  onQuery,
  onOnlyChanged,
  onPick,
}: {
  groups: Group[];
  marks: Mark[];
  visible: number[];
  active: number | null;
  /** Search and "only changed", for a list long enough to need them. */
  tools: boolean;
  query: string;
  onlyChanged: boolean;
  onQuery: (query: string) => void;
  onOnlyChanged: (onlyChanged: boolean) => void;
  onPick: (index: number) => void;
}) {
  const t = useTranslations("database.bulkIdentity");
  const listRef = useRef<HTMLUListElement>(null);
  // Moved with Previous / Next, the list keeps the open Sample ID in view.
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  return (
    <div className="flex shrink-0 flex-col gap-2 sm:min-h-0 sm:w-64">
      {tools ? (
        <div className="flex flex-col gap-1.5">
          <Input
            aria-label={t("search")}
            placeholder={t("search")}
            className="h-8"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="size-3.5 accent-primary"
              checked={onlyChanged}
              onChange={(event) => onOnlyChanged(event.target.checked)}
            />
            {t("onlyChanged")}
          </label>
        </div>
      ) : null}
      <ul
        ref={listRef}
        aria-label={t("listLabel")}
        className="flex max-h-40 flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-xl border p-1 sm:max-h-none sm:min-h-0 sm:flex-1"
      >
        {visible.map((index) => {
          const group = groups[index];
          const title = group.ident ?? t("groupNoIdent");
          const mark = marks[index];
          const current = index === active;
          return (
            <li key={group.ident ?? "none"}>
              <button
                type="button"
                aria-current={current ? "true" : undefined}
                onClick={() => onPick(index)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                  current ? "bg-primary/10 text-foreground" : "hover:bg-muted"
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <span
                    title={title}
                    className={cn("min-w-0 flex-1 truncate text-xs font-medium", group.ident ? "font-mono" : undefined)}
                  >
                    {title}
                  </span>
                  {mark.touched > 0 ? (
                    <Badge variant={mark.invalid ? "destructive" : "secondary"} className="h-4 px-1.5 text-[10px]">
                      {t("changedCount", { count: mark.touched })}
                    </Badge>
                  ) : null}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {group.records.length === 1
                    ? group.records[0].sample.sampleCode
                    : t("groupCount", { count: group.records.length })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
