"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SampleStatus } from "@/types";

const STATUS_CONFIG: Record<SampleStatus, { className: string }> = {
  PENDING: {
    className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  },
  IN_PROGRESS: {
    className: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400",
  },
  COMPLETED: {
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
};

export function StatusBadge({ status }: { status: SampleStatus }) {
  const t = useTranslations("samples.status");
  return (
    <Badge variant="outline" className={cn("border-0 font-medium", STATUS_CONFIG[status].className)}>
      {t(status)}
    </Badge>
  );
}
