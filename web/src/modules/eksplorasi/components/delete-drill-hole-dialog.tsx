"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/core/components/feedback/confirm-dialog";
import { toast } from "@/core/components/ui/toast";
import { apiFetch } from "@/core/lib/http/api-client";
import type { DrillHoleDTO } from "@/modules/eksplorasi/types";

/** Removing a drill hole is permanent, so it is asked once more by name. */
export function DeleteDrillHoleDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: DrillHoleDTO | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const t = useTranslations("drilling.delete");
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
    const outcome = await apiFetch<{ id: string }>(`/api/drill-holes/${target.id}`, {
      method: "DELETE",
      networkError: tCommon("networkError"),
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    toast(t("done", { holeId: target.holeId }));
    onDeleted(target.id);
    close();
  }

  return (
    <ConfirmDialog
      open={target !== null}
      title={t("title")}
      description={target ? t("confirm", { holeId: target.holeId }) : ""}
      confirmLabel={t("action")}
      busy={busy}
      error={error}
      onConfirm={() => void remove()}
      onClose={close}
    />
  );
}
