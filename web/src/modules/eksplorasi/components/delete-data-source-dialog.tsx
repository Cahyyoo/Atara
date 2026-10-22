"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/core/components/feedback/confirm-dialog";
import { toast } from "@/core/components/ui/toast";
import { apiFetch } from "@/core/lib/http/api-client";
import type { DataSourceDTO } from "@/modules/eksplorasi/types";

/** Removing a sample is permanent, so it is asked once more by name. */
export function DeleteDataSourceDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: DataSourceDTO | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const t = useTranslations("dataSource.delete");
  const tCommon = useTranslations("common");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    onClose();
  }

  async function remove() {
    if (!target) return;
    setError(null);
    setBusy(true);
    const outcome = await apiFetch<{ id: string }>(`/api/data-sources/${target.id}`, {
      method: "DELETE",
      networkError: tCommon("networkError"),
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    toast(t("done", { sampleId: target.sampleId }));
    onDeleted(target.id);
    close();
  }

  return (
    <ConfirmDialog
      open={target !== null}
      title={t("title")}
      description={target ? t("confirm", { sampleId: target.sampleId }) : ""}
      confirmLabel={t("action")}
      busy={busy}
      error={error}
      onConfirm={() => void remove()}
      onClose={close}
    />
  );
}
