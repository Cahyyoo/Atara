"use client";

import { TableHead } from "@/core/components/ui/table";
import { cn } from "@/core/lib/utils";
import { IoArrowDown, IoArrowUp, IoSwapVertical } from "react-icons/io5";

interface SortableHeadProps {
  label: string;
  field: string;
  sort: string;
  order: string;
  onSort: (field: string) => void;
  className?: string;
  align?: "left" | "right";
}

export function SortableHead({
  label,
  field,
  sort,
  order,
  onSort,
  className,
  align = "left",
}: SortableHeadProps) {
  const isActive = sort === field;

  return (
    <TableHead
      className={cn(align === "right" && "text-right", className)}
      aria-sort={isActive ? (order === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          isActive ? "text-foreground" : undefined,
          align === "right" && "flex-row-reverse"
        )}
      >
        {label}
        {isActive ? (
          order === "asc" ? (
            <IoArrowUp className="size-3.5" />
          ) : (
            <IoArrowDown className="size-3.5" />
          )
        ) : (
          <IoSwapVertical className="size-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}
