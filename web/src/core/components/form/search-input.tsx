"use client";

import { Input } from "@/core/components/ui/input";
import { cn } from "@/core/lib/utils";
import { IoSearchOutline } from "react-icons/io5";

/** A search box: the magnifier inside, its placeholder doubling as its accessible name. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  tourId,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  /** Marks the box for a guided tour (`data-tour`). */
  tourId?: string;
}) {
  return (
    <div className={cn("relative max-w-sm flex-1", className)}>
      <IoSearchOutline className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label={placeholder}
        data-tour={tourId}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="pl-8"
      />
    </div>
  );
}
