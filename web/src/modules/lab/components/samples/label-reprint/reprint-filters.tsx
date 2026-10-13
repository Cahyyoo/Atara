"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/core/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/core/components/ui/select";
import type { SampleStatus, StageDTO } from "@/modules/lab/types";
import { stageLabel } from "@/modules/lab/lib/stages/stages";
import { IoSearchOutline } from "react-icons/io5";
import type { IdentFilter } from "@/modules/lab/components/samples/label-reprint/use-label-reprint";

const STATUS_VALUES = ["ALL", "PENDING", "IN_PROGRESS", "COMPLETED"] as const;

interface ReprintFiltersProps {
  search: string;
  onSearchChange: (search: string) => void;
  status: SampleStatus | "ALL";
  onStatusChange: (status: SampleStatus | "ALL") => void;
  stageId: string;
  onStageIdChange: (stageId: string) => void;
  ident: IdentFilter;
  onIdentChange: (ident: IdentFilter) => void;
  stages: StageDTO[];
}

/** The search box and the three pickers above the reprint list. */
export function ReprintFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  stageId,
  onStageIdChange,
  ident,
  onIdentChange,
  stages,
}: ReprintFiltersProps) {
  const t = useTranslations("samples.labels");
  const tSamples = useTranslations("samples");
  const tStages = useTranslations("stages");

  const statusLabels = Object.fromEntries(
    STATUS_VALUES.map((value) => [
      value,
      value === "ALL" ? tSamples("allStatuses") : tSamples(`status.${value}`),
    ])
  );

  const identLabels: Record<string, string> = {
    ALL: t("identAll"),
    has: t("identHas"),
    missing: t("identMissing"),
  };

  const stageLabels: Record<string, string> = {
    ALL: tSamples("allStages"),
    ...Object.fromEntries(
      stages.map((stage) => [stage.id, stageLabel(tStages, stage.key, stage.name)])
    ),
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <IoSearchOutline className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={tSamples("searchPlaceholder")}
          data-tour="labels-search"
          placeholder={tSamples("searchPlaceholder")}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="pl-8"
        />
      </div>
      <Select
        value={status}
        items={statusLabels}
        onValueChange={(value) => onStatusChange((value ?? "ALL") as SampleStatus | "ALL")}
      >
        <SelectTrigger className="w-full sm:w-40" aria-label={tSamples("allStatuses")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {value === "ALL" ? tSamples("allStatuses") : tSamples(`status.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={stageId}
        items={stageLabels}
        onValueChange={(value) => onStageIdChange(value ?? "ALL")}
      >
        <SelectTrigger className="w-full sm:w-44" aria-label={tSamples("allStages")}>
          <SelectValue>{(value) => stageLabels[value as string] ?? ""}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">{tSamples("allStages")}</SelectItem>
          {stages.map((stage) => (
            <SelectItem key={stage.id} value={stage.id}>
              {stageLabel(tStages, stage.key, stage.name)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={ident}
        items={identLabels}
        onValueChange={(value) => onIdentChange((value ?? "ALL") as IdentFilter)}
      >
        <SelectTrigger data-tour="labels-ident" className="w-full sm:w-48" aria-label={t("identLabel")}>
          <SelectValue>{(value) => identLabels[value as string] ?? ""}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(identLabels).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
