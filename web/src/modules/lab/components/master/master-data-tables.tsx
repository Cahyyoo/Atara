"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ApiResult } from "@/core/types";
import type { MasterKind, MasterOptionDTO } from "@/modules/lab/types";
import { IoReloadOutline } from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";
import { KindCard } from "@/modules/lab/components/master/kind-card";

const KINDS: MasterKind[] = ["PLACE", "ROCK_TYPE", "NON_PROD", "PIT", "SIR"];

export function MasterDataTables() {
  const tCommon = useTranslations("common");
  const loadError = tCommon("loadError");

  const [options, setOptions] = useState<MasterOptionDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /// Bumped by a child after it changes something, which re-runs the load.
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    // Inline rather than a called helper: the state writes then sit behind an
    // await, which is what keeps them out of the effect's synchronous body.
    (async () => {
      try {
        // The only screen that needs the usage counts: a code in use is locked.
        const response = await fetch(withBasePath("/api/master-options?withUsage=1"), {
          signal: controller.signal,
        });
        const body: ApiResult<{ options: MasterOptionDTO[] }> = await response.json();
        if (body.success) {
          setOptions(body.data.options);
          setError(null);
        } else {
          setError(body.error);
        }
      } catch (caught) {
        // An aborted request is a superseded one; its result is not wanted.
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(loadError);
      }
    })();

    return () => controller.abort();
  }, [reloadToken, loadError]);

  if (error) {
    return <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>;
  }

  if (!options) {
    return (
      <div role="status" className="flex h-40 items-center justify-center text-muted-foreground">
        <IoReloadOutline aria-hidden className="size-6 animate-spin" />
        <span className="sr-only">{tCommon("loading")}</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {KINDS.map((kind) => (
        <KindCard
          key={kind}
          kind={kind}
          options={options.filter((option) => option.kind === kind)}
          onChanged={reload}
        />
      ))}
    </div>
  );
}
