"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/core/components/ui/badge";
import { Input } from "@/core/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/core/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/core/components/ui/table";
import { AnimatedTableRow } from "@/core/components/ui/animated-table-row";
import { SortableHead } from "@/core/components/ui/sortable-head";
import { TableSkeleton } from "@/core/components/ui/table-skeleton";
import { TableRefreshing } from "@/core/components/ui/table-refreshing";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { ExportMenu, TablePagination } from "@/core/components/table/table-toolbar";
import { usePendingDisplay } from "@/core/hooks/use-pending-display";
import { useTableParams } from "@/core/hooks/use-table-params";
import { downloadFromApi } from "@/core/lib/http/download";
import { SIGN_IN_OUTCOMES, type SignInOutcomeName } from "@/modules/system/lib/sign-in-audit-query";
import type { ApiResult } from "@/core/types";
import { IoPhonePortraitOutline, IoScanOutline } from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";
import { FilterChips } from "@/core/components/table/filter-chips";
import {
  COLUMN_COUNT,
  LAB_TIMEZONE,
  OUTCOME_TONE,
  type AuditResponse,
} from "@/modules/system/components/activity/sign-in-audit-types";

export function SignInAuditTable() {
  const t = useTranslations("signInAudit");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const loadError = tCommon("loadError");
  const { get, setParams } = useTableParams();

  const userId = get("userId", "ALL");
  const outcome = get("outcome", "ALL");
  const from = get("from", "");
  const to = get("to", "");
  const order = get("order", "desc");
  const page = get("page", "1");
  const pageSize = get("pageSize", "10");

  const [result, setResult] = useState<{ key: string; data: AuditResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** The filters without paging: the export is handed exactly these. */
  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (userId !== "ALL") params.set("userId", userId);
    if (outcome !== "ALL") params.set("outcome", outcome);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params;
  }, [userId, outcome, from, to]);

  const queryKey = (() => {
    const params = buildParams();
    params.set("order", order);
    params.set("page", page);
    params.set("pageSize", pageSize);
    return params.toString();
  })();

  // Loading is derived from "the answer we hold is for an older query", the
  // same way the other tables do it, so the rows in hand stay on screen while
  // the next set is fetched.
  const isLoading = result?.key !== queryKey;
  const showRefreshing = usePendingDisplay(isLoading);
  const entries = result?.data.entries ?? [];
  const summary = result?.data.summary ?? [];
  const users = result?.data.users ?? [];
  const pagination = result?.data.pagination ?? null;

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(withBasePath(`/api/sign-in-audit?${queryKey}`), {
          signal: controller.signal,
        });
        const body: ApiResult<AuditResponse> = await response.json();

        if (!body.success) {
          setError(body.error);
          return;
        }
        setError(null);
        setResult({ key: queryKey, data: body.data });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(loadError);
      }
    })();

    return () => controller.abort();
  }, [queryKey, loadError]);

  async function handleExport(exportFormat: "xlsx" | "csv") {
    setError(null);
    const params = buildParams();
    params.set("format", exportFormat);

    const message = await downloadFromApi(
      `/api/sign-in-audit/export?${params.toString()}`,
      `sign-in-audit.${exportFormat}`
    );
    if (message) setError(message);
  }

  const outcomeLabel = (name: SignInOutcomeName) => t(`outcomes.${name}`);

  const userLabels: Record<string, string> = {
    ALL: t("allPeople"),
    ...Object.fromEntries(users.map((user) => [user.id, user.name])),
  };
  const outcomeLabels: Record<string, string> = {
    ALL: t("allOutcomes"),
    ...Object.fromEntries(SIGN_IN_OUTCOMES.map((name) => [name, outcomeLabel(name)])),
  };

  return (
    <div className="flex flex-col gap-4">
      {/* The shape of the trail, across everything the filters match. */}
      <FilterChips
        title={t("summaryTitle")}
        hint={t("summaryHint")}
        emptyText={t("summaryEmpty")}
        items={summary.map((entry) => ({ key: entry.outcome, label: outcomeLabel(entry.outcome), total: entry.total }))}
        picked={outcome}
        onPick={(key) => setParams({ outcome: key })}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div data-tour="activity-filters" className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
          {/*
            Two days, inclusive at both ends, and both are lab days: the shift
            turns over at 07:00 WITA, so "the 12th" here means the shift the lab
            calls the 12th.
          */}
          <Input
            type="date"
            aria-label={t("from")}
            value={from}
            max={to || undefined}
            onChange={(event) => setParams({ from: event.target.value || null })}
            className="w-full sm:w-44"
          />
          <Input
            type="date"
            aria-label={t("to")}
            value={to}
            min={from || undefined}
            onChange={(event) => setParams({ to: event.target.value || null })}
            className="w-full sm:w-44"
          />

          <Select
            value={userId}
            items={userLabels}
            onValueChange={(value) => setParams({ userId: value === "ALL" ? null : value })}
          >
            <SelectTrigger className="w-full sm:w-48" aria-label={t("allPeople")}>
              <SelectValue>{(value) => userLabels[value as string] ?? ""}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allPeople")}</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={outcome}
            items={outcomeLabels}
            onValueChange={(value) => setParams({ outcome: value === "ALL" ? null : value })}
          >
            <SelectTrigger className="w-full sm:w-56" aria-label={t("allOutcomes")}>
              <SelectValue>{(value) => outcomeLabels[value as string] ?? ""}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allOutcomes")}</SelectItem>
              {SIGN_IN_OUTCOMES.map((name) => (
                <SelectItem key={name} value={name}>
                  {outcomeLabel(name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ExportMenu tourId="activity-export" onExport={handleExport} />
      </div>

      <InlineNotice tone="error">{error}</InlineNotice>

      <TableRefreshing isRefreshing={showRefreshing}>
        <div data-tour="activity-table" className="overflow-x-auto rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  label={t("when")}
                  field="createdAt"
                  sort="createdAt"
                  order={order}
                  onSort={() => setParams({ order: order === "desc" ? "asc" : "desc" })}
                  className="w-44"
                />
                <TableHead className="w-64">{t("who")}</TableHead>
                <TableHead className="w-48">{t("result")}</TableHead>
                <TableHead className="w-44">{t("verified")}</TableHead>
                <TableHead>{t("address")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && entries.length === 0 ? (
                <TableSkeleton rows={Math.min(Number(pageSize) || 10, 10)} columns={COLUMN_COUNT} />
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={COLUMN_COUNT}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {t("empty")}
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry, rowIndex) => (
                  <AnimatedTableRow key={entry.id} index={rowIndex}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {format.dateTime(new Date(entry.createdAt), {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: LAB_TIMEZONE,
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{entry.userName}</div>
                      <div className="text-xs text-muted-foreground">{entry.userEmail}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={OUTCOME_TONE[entry.outcome]}>
                        {outcomeLabel(entry.outcome)}
                      </Badge>
                    </TableCell>
                    {/*
                      The column the table exists for, and it is read from the
                      stored booleans rather than worked out from the outcome
                      beside it. The sign-in routes decide what counts as
                      verified; if this inferred it instead, an outcome added
                      later could start claiming a face was checked when none
                      was — and the trail would be confidently wrong, which is
                      worse than empty.
                    */}
                    <TableCell>
                      {entry.faceVerified || entry.totpVerified ? (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {entry.faceVerified ? (
                            <span className="inline-flex items-center gap-1">
                              <IoScanOutline className="size-3.5" />
                              {t("verifiedFace")}
                            </span>
                          ) : null}
                          {entry.totpVerified ? (
                            <span className="inline-flex items-center gap-1">
                              <IoPhonePortraitOutline className="size-3.5" />
                              {t("verifiedTotp")}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t("verifiedNone")}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {/*
                        Blank rather than a guess. Without TRUST_PROXY the
                        forwarded header is the caller's own to write, so there
                        is no address this deployment can vouch for — and a
                        column that quietly lies is worse than one that admits
                        it does not know.
                      */}
                      {entry.address ?? t("addressUnknown")}
                    </TableCell>
                  </AnimatedTableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TableRefreshing>

      {pagination ? (
        <TablePagination
          pagination={pagination}
          shown={entries.length}
          noun={t("noun")}
          pageSize={pageSize}
          onPageSizeChange={(value) => setParams({ pageSize: value === "10" ? null : value })}
          onPageChange={(next) => setParams({ page: next === 1 ? null : String(next) })}
        />
      ) : null}
    </div>
  );
}
