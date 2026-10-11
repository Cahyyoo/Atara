"use client";

import { useTranslations } from "next-intl";
import { useTableParams } from "@/hooks/use-table-params";
import { StageActivityTable } from "@/components/activity/stage-activity-table";
import { SignInAuditTable } from "@/components/activity/sign-in-audit-table";
import type { StageDTO } from "@/types";

/**
 * Two trails on one page.
 *
 * "What happened to the samples" and "who signed in" are one category in the
 * head of somebody investigating something, and both are opened rarely. An
 * eleventh entry in the sidebar for the second one would be noise in a menu
 * every operator sees every day, to reach a page only admins ever open.
 *
 * Buttons with `aria-pressed` rather than the ARIA tabs pattern: that pattern
 * owes the reader arrow-key navigation and focus management, and a half-built
 * version of it is worse for a screen reader than a plain pair of buttons that
 * say which one is on. The same shape is already used by the per-person chips
 * below.
 */

export const ACTIVITY_TABS = ["stages", "signIn"] as const;
export type ActivityTab = (typeof ACTIVITY_TABS)[number];
type Tab = ActivityTab;

/**
 * The filter keys each tab owns.
 *
 * Cleared when leaving a tab, because the two share the URL: `outcome` left
 * behind by the sign-in trail would quietly narrow nothing visible and then
 * reappear in an export the moment somebody came back. Paging is dropped by
 * `setParams` already, on any change that is not paging itself.
 */
const TAB_PARAMS: Record<Tab, string[]> = {
  stages: ["search", "operatorId", "stageId", "shiftDate", "corrections"],
  signIn: ["userId", "outcome", "from", "to"],
};

/** Only what the stage filter row and a stage label need. */
type StageOption = Pick<StageDTO, "id" | "key" | "name">;

/**
 * Since the app became a super app the two trails belong to different people:
 * the lab admin reads the stage moves (/lab/activity), the super admin the
 * sign-ins of every department (/admin/sign-ins). Each page passes the tabs
 * its reader holds; with one, the switch is not drawn.
 */
export function ActivityTabs({
  stages,
  tabs = ACTIVITY_TABS,
}: {
  stages: StageOption[];
  tabs?: readonly Tab[];
}) {
  const t = useTranslations("activity");
  const tStageActivity = useTranslations("stageActivity");
  const tSignInAudit = useTranslations("signInAudit");
  const { get, setParams } = useTableParams();

  const first = tabs[0] ?? "stages";
  const raw = get("tab", first);
  const tab: Tab = tabs.includes(raw as Tab) ? (raw as Tab) : first;

  const labels: Record<Tab, string> = {
    stages: tStageActivity("title"),
    signIn: tSignInAudit("title"),
  };
  const subtitles: Record<Tab, string> = {
    stages: tStageActivity("subtitle"),
    signIn: tSignInAudit("subtitle"),
  };

  function pick(next: Tab) {
    if (next === tab) return;
    // Sort and order belong to whichever table was showing, and the two do not
    // sort by the same thing, so they go with the filters.
    const cleared = Object.fromEntries(
      [...TAB_PARAMS[tab], "sort", "order"].map((key) => [key, null])
    );
    setParams({ ...cleared, tab: next === first ? null : next });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {tabs.length > 1 ? t("title") : labels[tab]}
        </h1>

        {tabs.length > 1 ? (
        <div
          data-tour="activity-tabs"
          role="group"
          aria-label={t("title")}
          className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1"
        >
          {tabs.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={tab === name}
              onClick={() => pick(name)}
              className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
                tab === name
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {labels[name]}
            </button>
          ))}
        </div>
        ) : null}

        <p className="text-sm text-muted-foreground">{subtitles[tab]}</p>
      </div>

      {/*
        Unmounted rather than hidden, so the tab that is not showing is not
        fetching: each table refetches on every filter change, and a hidden one
        would keep asking for rows nobody is reading.
      */}
      {tab === "stages" ? <StageActivityTable stages={stages} /> : <SignInAuditTable />}
    </div>
  );
}
