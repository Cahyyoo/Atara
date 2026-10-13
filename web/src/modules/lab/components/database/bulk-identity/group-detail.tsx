"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { cn } from "@/core/lib/utils";
import type { MasterOptionDTO } from "@/modules/lab/types";
import { IoChevronBack, IoChevronForward } from "react-icons/io5";
import { GroupFields } from "@/modules/lab/components/database/bulk-identity/group-fields";
import type {
  Group,
  GroupState,
  GroupUpdate,
  Initial,
} from "@/modules/lab/components/database/bulk-identity/identity-plan";

/** The open Sample ID's form, with Previous / Next through the ones listed. */
export function GroupDetail({
  index,
  group,
  position,
  visible,
  initial,
  state,
  options,
  onPick,
  onChange,
}: {
  index: number;
  group: Group;
  position: number;
  visible: number[];
  initial: Initial;
  state: GroupState;
  options: MasterOptionDTO[];
  onPick: (index: number) => void;
  onChange: GroupUpdate;
}) {
  const t = useTranslations("database.bulkIdentity");
  const title = group.ident ?? t("groupNoIdent");
  const subtitle =
    group.records.length === 1 ? group.records[0].sample.sampleCode : t("groupCount", { count: group.records.length });

  return (
    <section
      aria-label={title}
      className="flex min-h-0 flex-1 flex-col gap-3 overscroll-contain sm:overflow-y-auto sm:pr-1 [contain:content]"
    >
      <header className="flex items-start gap-2">
        <div key={index} className="min-w-0 flex-1 animate-in duration-150 fade-in-0 slide-in-from-right-1">
          <h3 className={cn("text-sm font-semibold break-all", group.ident ? "font-mono" : undefined)}>{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("previous")}
            title={t("previous")}
            disabled={position <= 0}
            onClick={() => onPick(visible[position - 1])}
          >
            <IoChevronBack />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("position", { at: position + 1, count: visible.length })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("next")}
            title={t("next")}
            disabled={position >= visible.length - 1}
            onClick={() => onPick(visible[position + 1])}
          >
            <IoChevronForward />
          </Button>
        </div>
      </header>
      <GroupFields
        index={index}
        several={group.records.length > 1}
        initial={initial}
        state={state}
        options={options}
        onChange={onChange}
      />
    </section>
  );
}
