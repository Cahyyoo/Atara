"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/core/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/core/components/ui/dropdown-menu";
import type { PaginationDTO } from "@/core/types";
import { IoChevronBack, IoChevronForward, IoDocumentTextOutline, IoDownloadOutline, IoGridOutline } from "react-icons/io5";

export const PAGE_SIZE_OPTIONS = ["10", "25", "50", "100"];

/** Export button offering both a real .xlsx workbook and plain CSV. */
export function ExportMenu({
  onExport,
  tourId,
}: {
  onExport: (format: "xlsx" | "csv") => void;
  /** Marks the button for a guided tour (`data-tour`). */
  tourId?: string;
}) {
  const t = useTranslations("common");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button data-tour={tourId} variant="outline" className="gap-2">
            <IoDownloadOutline className="size-4" />
            {t("export")}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onExport("xlsx")}>
          <IoGridOutline className="size-4" />
          {t("exportExcel")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport("csv")}>
          <IoDocumentTextOutline className="size-4" />
          {t("exportCsv")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TablePaginationProps {
  pagination: PaginationDTO;
  shown: number;
  noun: string;
  pageSize: string;
  onPageSizeChange: (value: string) => void;
  onPageChange: (page: number) => void;
}

export function TablePagination({
  pagination,
  shown,
  noun,
  pageSize,
  onPageSizeChange,
  onPageChange,
}: TablePaginationProps) {
  const t = useTranslations("common");

  return (
    <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <span>{t("showing", { shown, total: pagination.total, noun })}</span>
        <Select value={pageSize} onValueChange={(value) => onPageSizeChange(value ?? "10")}>
          {/* "Showing 1-10 of 42" sits beside it, but that text is not its name. */}
          <SelectTrigger size="sm" className="w-20" aria-label={t("perPage")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>{t("perPage")}</span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("previousPage")}
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
        >
          <IoChevronBack className="size-4" />
        </Button>
        <span>{t("pageOf", { page: pagination.page, total: pagination.totalPages })}</span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("nextPage")}
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(Math.min(pagination.totalPages, pagination.page + 1))}
        >
          <IoChevronForward className="size-4" />
        </Button>
      </div>
    </div>
  );
}
