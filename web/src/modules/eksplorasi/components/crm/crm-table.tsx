"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/core/components/ui/table";
import { Skeleton } from "@/core/components/ui/skeleton";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { ConfirmDialog } from "@/core/components/feedback/confirm-dialog";
import { toast } from "@/core/components/ui/toast";
import { apiFetch } from "@/core/lib/http/api-client";
import { CRM_COLUMNS, type CrmKind } from "@/modules/eksplorasi/lib/crm-list-columns";
import { CrmDialog } from "@/modules/eksplorasi/components/crm/crm-dialog";
import type { CrmRowDTO } from "@/modules/eksplorasi/types";
import { IoAdd, IoPencilOutline, IoTrashOutline } from "react-icons/io5";

/** How a row is named to a person: "Oreas182 · Fusion XRF", or its label. */
export function crmRowName(kind: CrmKind, row: CrmRowDTO): string {
  return kind === "standard" ? `${row.standard} · ${row.testMethod}` : (row.label ?? "");
}

/**
 * One table of the CRM List, read whole -- a few dozen rows at most -- with
 * its own Add button and, on every row, Edit and Delete. The columns come
 * from crm-list-columns.ts, so the three tables are this one component.
 */
export function CrmTable({ kind }: { kind: CrmKind }) {
  const t = useTranslations("crmList");
  const tCommon = useTranslations("common");
  const tableName = t(`tables.${kind}.title`);
  const columns = CRM_COLUMNS[kind];

  const [rows, setRows] = useState<CrmRowDTO[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** The dialog: undefined is closed, null is adding, a row is editing it. */
  const [editing, setEditing] = useState<CrmRowDTO | null | undefined>(undefined);
  /** Bumped on every opening, so each one starts from a fresh form. */
  const [dialogKey, setDialogKey] = useState(0);
  const [deleting, setDeleting] = useState<CrmRowDTO | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /** Bumped after a save or a delete, and by Try again, which re-runs the load. */
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  const networkError = tCommon("networkError");

  useEffect(() => {
    const controller = new AbortController();
    // Inline rather than a called helper: the state writes then sit behind an
    // await, out of the effect's synchronous body (as master-data-tables does).
    (async () => {
      try {
        const outcome = await apiFetch<CrmRowDTO[]>(`/api/crm-list/${kind}`, { signal: controller.signal, networkError });
        if (outcome.ok) {
          setRows(outcome.data);
          setLoadError(null);
        } else {
          setLoadError(outcome.error);
        }
      } catch {
        // apiFetch only throws for an aborted request: a superseded load, not wanted.
      }
    })();
    return () => controller.abort();
  }, [kind, reloadToken, networkError]);

  function openDialog(row: CrmRowDTO | null) {
    setDialogKey((key) => key + 1);
    setEditing(row);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const outcome = await apiFetch<{ id: string }>(`/api/crm-list/${kind}/${deleting.id}`, {
      method: "DELETE",
      networkError: tCommon("networkError"),
    });
    setDeleteBusy(false);
    if (!outcome.ok) {
      setDeleteError(outcome.error);
      return;
    }
    toast(t("deleted", { name: crmRowName(kind, deleting) }));
    setDeleting(null);
    reload();
  }

  return (
    <Card data-crm-kind={kind}>
      <CardHeader>
        <CardTitle className="text-base">{tableName}</CardTitle>
        <CardDescription>{t(`tables.${kind}.description`)}</CardDescription>
        <CardAction>
          <Button type="button" size="sm" className="gap-1.5" onClick={() => openDialog(null)}>
            <IoAdd aria-hidden />
            {t("add")}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {loadError ? (
          <div className="flex items-center gap-3">
            <InlineNotice tone="error">{`${t("loadFailed")} ${loadError}`}</InlineNotice>
            <Button type="button" variant="outline" size="sm" onClick={reload}>
              {t("retry")}
            </Button>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.field} className={column.key ? "whitespace-nowrap" : "whitespace-nowrap text-right"}>
                    {column.header}
                  </TableHead>
                ))}
                <TableHead className="w-0 text-right">
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null && !loadError ? (
                <TableRow>
                  {columns.map((column) => (
                    <TableCell key={column.field}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                  <TableCell />
                </TableRow>
              ) : rows !== null && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="py-6 text-center text-sm text-muted-foreground">
                    {t("empty")}
                  </TableCell>
                </TableRow>
              ) : (
                (rows ?? []).map((row) => (
                  <TableRow key={row.id}>
                    {columns.map((column) => (
                      <TableCell
                        key={column.field}
                        className={
                          column.key
                            ? "whitespace-nowrap font-medium"
                            : "whitespace-nowrap text-right font-mono tabular-nums"
                        }
                      >
                        {row[column.field] ?? <span className="text-muted-foreground">–</span>}
                      </TableCell>
                    ))}
                    <TableCell className="whitespace-nowrap text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${t("edit")} ${crmRowName(kind, row)}`}
                        onClick={() => openDialog(row)}
                      >
                        <IoPencilOutline aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        aria-label={`${t("delete")} ${crmRowName(kind, row)}`}
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(row);
                        }}
                      >
                        <IoTrashOutline aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {editing !== undefined ? (
        <CrmDialog
          key={dialogKey}
          kind={kind}
          open
          row={editing}
          onClose={() => setEditing(undefined)}
          onSaved={(saved) => {
            toast(t("saved", { name: crmRowName(kind, saved) }));
            setEditing(undefined);
            reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title={t("deleteDialog.title")}
        description={
          deleting ? t("deleteDialog.confirm", { name: crmRowName(kind, deleting), table: tableName }) : ""
        }
        confirmLabel={t("deleteDialog.action")}
        busy={deleteBusy}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />
    </Card>
  );
}
