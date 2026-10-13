"use client";

import { useState, type Ref } from "react";
import { cn } from "@/core/lib/utils";

/**
 * Six boxes for a six-digit code, drawn over one real input.
 *
 * The boxes are only a picture. What the keyboard, a paste, the browser's
 * one-time-code autofill and a screen reader all meet is a single ordinary
 * input stretched across them with its text made invisible. Six separate
 * inputs would each need focus juggling, would break paste into pieces, and
 * would read out as six unlabelled fields.
 *
 * Grouped three and three because that is how Microsoft Authenticator shows
 * the code, so what is on the phone and what is on the screen look the same.
 */
export function OtpInput({
  id,
  value,
  onChange,
  length = 6,
  disabled,
  autoFocus,
  invalid,
  ref,
}: {
  id: string;
  value: string;
  onChange: (raw: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}) {
  const [focused, setFocused] = useState(false);
  const half = Math.ceil(length / 2);

  const cell = (index: number) => {
    const digit = value[index];
    // The box the next digit lands in, or the last one once all are full.
    const isActive = focused && index === Math.min(value.length, length - 1);
    return (
      <div
        key={index}
        className={cn(
          "flex size-10 items-center justify-center rounded-sm border bg-field sm:size-11 font-mono text-xl font-medium transition-colors",
          digit ? "border-foreground/25" : "border-transparent",
          isActive && "border-ring ring-3 ring-ring/40",
          invalid && "border-destructive ring-destructive/20",
          disabled && "opacity-50"
        )}
      >
        {digit ?? (isActive ? <span className="h-5 w-px animate-pulse bg-foreground" /> : null)}
      </div>
    );
  };

  return (
    <div className="relative flex items-center justify-center gap-1.5">
      {Array.from({ length: half }, (_, index) => cell(index))}
      <span aria-hidden className="w-2" />
      {Array.from({ length: length - half }, (_, index) => cell(half + index))}

      <input
        ref={ref}
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        // Room for a pasted "123 456"; the caller keeps only the digits.
        maxLength={length + 2}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
      />
    </div>
  );
}
