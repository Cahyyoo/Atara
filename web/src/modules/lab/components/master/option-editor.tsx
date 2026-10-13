"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import type { ApiResult } from "@/core/types";
import type { MasterOptionDTO } from "@/modules/lab/types";
import { IoCheckmark, IoClose, IoReloadOutline } from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";

/**
 * One row turned into inputs.
 *
 * The code is locked once anything uses it: it is inside every Sample ID
 * composed from it, and renaming it here would leave those ids saying something
 * this list no longer does. The server refuses it too — this only explains why.
 */
export function OptionEditor({
  option,
  onDone,
  onSaved,
  onError,
}: {
  option: MasterOptionDTO;
  onDone: () => void;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations("masterData");
  const tCommon = useTranslations("common");

  const [code, setCode] = useState(option.code);
  const [label, setLabel] = useState(option.label ?? "");
  const [isBusy, setIsBusy] = useState(false);
  const locked = (option.usageCount ?? 0) > 0;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    onError(null);

    try {
      const response = await fetch(withBasePath(`/api/master-options/${option.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(locked ? {} : { code }),
          label: label.trim() === "" ? null : label.trim(),
        }),
      });
      const body: ApiResult<MasterOptionDTO> = await response.json();
      if (!body.success) {
        onError(body.error);
        return;
      }
      onSaved();
      onDone();
    } catch {
      onError(tCommon("networkError"));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <li className="rounded-lg border bg-muted/30 px-3 py-2">
      <form onSubmit={save} className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={t("addCode")}
          className="h-9 w-24 font-mono"
          required
          disabled={locked}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <Input
          aria-label={t("addLabel")}
          placeholder={t("addLabel")}
          className="h-9 w-full sm:w-44"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={isBusy}>
          {isBusy ? <IoReloadOutline aria-hidden className="size-4 animate-spin" /> : <IoCheckmark className="size-4" />}
          {tCommon("save")}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5" onClick={onDone}>
          <IoClose className="size-4" />
          {tCommon("cancel")}
        </Button>
      </form>
      {locked ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t("codeLocked", { count: option.usageCount ?? 0 })}
        </p>
      ) : null}
    </li>
  );
}
