"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/core/lib/utils";
import { DASHBOARD_TABS, type DashboardTab } from "@/modules/eksplorasi/lib/dashboard-tabs";
import { blankAttention, duplicateAttention, standardAttention } from "@/modules/eksplorasi/lib/qc-overview";
import type { QcBlank, QcControl, QcDuplicate } from "@/modules/eksplorasi/types";
import { ControlElementPicker, useControlElements } from "@/modules/eksplorasi/components/dashboard/control-element-picker";
import { QcControlSection, useControlCriteria } from "@/modules/eksplorasi/components/dashboard/qc-control-section";
import { QcBlankSection, useBlankCriteria } from "@/modules/eksplorasi/components/dashboard/qc-blank-section";
import { QcDuplicateSection, useDuplicateCriteria } from "@/modules/eksplorasi/components/dashboard/qc-duplicate-section";
import { IoAlertCircle } from "react-icons/io5";

/**
 * The eksplorasi dashboard: a tab for each QC check -- the OREAS standards,
 * the blanks, the duplicates -- each with its own choices, table and
 * charts, all for the elements ticked under Elements beside the
 * tabs (remembered in this browser).
 *
 * Every section's choices and data are kept here, and every panel stays
 * mounted when hidden: switching tabs keeps what was chosen, and each tab
 * counts what wants a look while another is open. A hidden panel's charts
 * are not drawn (LazyPlot builds a chart only once it is in sight). The open
 * tab is kept in the address (?tab=blank), to share and to reload.
 */
export function QcDashboard({
  initialTab,
  initialControl,
  initialBlank,
  duplicates,
}: {
  initialTab: DashboardTab;
  initialControl: QcControl;
  initialBlank: QcBlank;
  duplicates: QcDuplicate;
}) {
  const t = useTranslations("qcDashboard.tabs");
  const [elements, setElements] = useControlElements();
  const [tab, setTab] = useState<DashboardTab>(initialTab);
  const tabRefs = useRef<Partial<Record<DashboardTab, HTMLButtonElement | null>>>({});

  const control = useControlCriteria(initialControl);
  const blank = useBlankCriteria(initialBlank);
  const duplicate = useDuplicateCriteria(duplicates);

  const attention = useMemo<Record<DashboardTab, number>>(
    () => ({
      standard: standardAttention(control.data.summary.filter(({ element }) => elements.includes(element))),
      blank: blankAttention(blank.data.elements.filter(({ element }) => elements.includes(element))),
      duplicate: duplicateAttention(duplicate.data.elements.filter(({ element }) => elements.includes(element))),
    }),
    [control.data, blank.data, duplicate.data, elements]
  );

  function open(next: DashboardTab, focus = false) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
    if (focus) tabRefs.current[next]?.focus();
  }

  /** Left and right move between the tabs, Home and End to either end, as a tab list does. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = DASHBOARD_TABS.indexOf(tab);
    const last = DASHBOARD_TABS.length - 1;
    const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[
      event.key
    ];
    if (next === undefined) return;
    event.preventDefault();
    open(DASHBOARD_TABS[next], true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label={t("label")} onKeyDown={onKeyDown} className="flex gap-0.5 rounded-xl bg-muted p-1">
          {DASHBOARD_TABS.map((name) => {
            const selected = tab === name;
            const count = attention[name];
            return (
              <button
                key={name}
                ref={(node) => {
                  tabRefs.current[name] = node;
                }}
                id={`qc-tab-${name}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`qc-panel-${name}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => open(name)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t(name)}
                {count > 0 ? (
                  <span
                    className="flex items-center gap-0.5 rounded-full bg-destructive/10 px-1.5 text-xs font-medium text-destructive tabular-nums"
                    title={t("attention", { count })}
                  >
                    <IoAlertCircle aria-hidden className="size-3.5" />
                    {count}
                    <span className="sr-only">{t("attention", { count })}</span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <ControlElementPicker shown={elements} onChange={setElements} />
      </div>

      <div role="tabpanel" id="qc-panel-standard" aria-labelledby="qc-tab-standard" hidden={tab !== "standard"}>
        <QcControlSection criteria={control} elements={elements} />
      </div>
      <div role="tabpanel" id="qc-panel-blank" aria-labelledby="qc-tab-blank" hidden={tab !== "blank"}>
        <QcBlankSection criteria={blank} elements={elements} />
      </div>
      <div role="tabpanel" id="qc-panel-duplicate" aria-labelledby="qc-tab-duplicate" hidden={tab !== "duplicate"}>
        <QcDuplicateSection criteria={duplicate} elements={elements} />
      </div>
    </div>
  );
}
