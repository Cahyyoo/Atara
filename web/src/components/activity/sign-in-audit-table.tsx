"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AnimatedTableRow } from "@/components/ui/animated-table-row";
import { SortableHead } from "@/components/ui/sortable-head";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { TableRefreshing } from "@/components/ui/table-refreshing";
import { InlineNotice } from "@/components/ui/inline-notice";
import { ExportMenu, TablePagination } from "@/components/shared/table-toolbar";
import { usePendingDisplay } from "@/hooks/use-pending-display";
import { useTableParams } from "@/hooks/use-table-params";
import { downloadFromApi } from "@/lib/download";
import { SIGN_IN_OUTCOMES, type SignInOutcomeName } from "@/lib/sign-in-audit-query";
import type { ApiResult, PaginationDTO } from "@/types";
import { IoPhonePortraitOutline, IoScanOutline } from "react-icons/io5";

interface AuditEntry {
  id: string;
  createdAt: string;
  outcome: SignInOutcomeName;
  faceVerified: boolean;
  totpVerified: boolean;
  address: string | null;
  userId: string;
  userName: string;
  userEmail: string;
}

interface OutcomeTotal {
  outcome: SignInOutcomeName;
  total: number;
}

interface AuditResponse {
  entries: AuditEntry[];
  summary: OutcomeTotal[];
  users: { id: string; name: string; email: string; isActive: boolean }[];
  pagination: PaginationDTO;
}

const COLUMN_COUNT = 5;

/** The lab reads every timestamp on its own clock, not the browser's. */
const LAB_TIMEZONE = "Asia/Makassar";

/**
 * How each outcome should look.
 *
 * A full map rather than a condition, so an outcome added to the schema later
 * cannot inherit a colour from a branch somebody forgot: the type requires an
 * entry for every name.
 */
const OUTCOME_TONE: Record<SignInOutcomeName, "default" | "secondary" | "destructive"> = {
  FACE_VERIFIED: "default",
  TOTP_VERIFIED: "default",
  TOTP_ENROLLED: "default",
  // Not a failure — somebody did sign in — but not a proof of person either,
  // and that is the whole reason this table exists. Neutral, never green.
  PASSWORD_ONLY: "secondary",
  FACE_MISMATCH: "destructive",
  TOTP_MISMATCH: "destructive",
  FACE_UNREADABLE: "destructive",
  FACE_SERVICE_DOWN: "destructive",
  PASSWORD_FAILED: "destructive",
  ACCOUNT_LOCKED: "destructive",
  ACCOUNT_INACTIVE: "destructive",
  // Somebody signed in elsewhere; nothing failed. Worth noticing, not alarming.
  SESSION_REPLACED: "secondary",
  PASSWORD_CHANGED: "secondary",
  SESSION_ENDED_BY_ADMIN: "secondary",
};

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
        const response = await fetch(`/api/sign-in-audit?${queryKey}`, {
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
      {/*
        The shape of the trail, counted across everything the filters match
        rather than across this page. It deliberately ignores the outcome
        filter: picking one narrows the list below, and if the chips narrowed
        too they would collapse to a single figure and take away the comparison
        that made you click.
      */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("summaryTitle")}</CardTitle>
          <CardDescription>{t("summaryHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("summaryEmpty")}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {summary.map((entry) => {
                const isPicked = entry.outcome === outcome;
                return (
                  <li key={entry.outcome}>
                    <button
                      type="button"
                      aria-pressed={isPicked}
                      onClick={() => setParams({ outcome: isPicked ? null : entry.outcome })}
                      className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                        isPicked
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/60 hover:bg-muted"
                      }`}
                    >
                      <span className="font-medium">{outcomeLabel(entry.outcome)}</span>
                      <span className="tabular-nums opacity-80">{entry.total}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

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
