"use client";

import { useTranslations } from "next-intl";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { COMPACT_FROM } from "@/modules/lab/components/database/bulk-identity/identity-plan";
import { useBulkIdentityForm } from "@/modules/lab/components/database/bulk-identity/use-bulk-identity-form";
import { GroupDetail } from "@/modules/lab/components/database/bulk-identity/group-detail";
import { GroupFields } from "@/modules/lab/components/database/bulk-identity/group-fields";
import { GroupList } from "@/modules/lab/components/database/bulk-identity/group-list";
import { IdentityFooter } from "@/modules/lab/components/database/bulk-identity/identity-footer";
import { IdentityPreview } from "@/modules/lab/components/database/bulk-identity/identity-preview";
import { MinimizedBar } from "@/modules/lab/components/database/bulk-identity/minimized-bar";
import { ModeSwitch } from "@/modules/lab/components/database/bulk-identity/mode-switch";

export function BulkIdentityForm({
  records,
  busy,
  minimized,
  onRestore,
  onBusy,
  onCancel,
  onSaved,
  canCreateOption = false,
}: {
  records: LabRecordListItemDTO[];
  busy: boolean;
  minimized: boolean;
  onRestore: () => void;
  onBusy: (busy: boolean) => void;
  onCancel: () => void;
  onSaved: () => void;
  /** Whether a code missing from a picker may be added to the master data. */
  canCreateOption?: boolean;
}) {
  const t = useTranslations("database.bulkIdentity");
  const form = useBulkIdentityForm({ records, onBusy, onSaved });
  const { groups, initials, eachStates, shownActive, options } = form;

  return (
    <>
      {/* Minimized, the dialog is hidden; this bar stands in for it, outside
          the hidden popup. */}
      {minimized ? (
        <MinimizedBar
          count={records.length}
          changed={form.changedFields}
          busy={busy}
          onRestore={onRestore}
          onCancel={onCancel}
        />
      ) : null}

      {form.several ? (
        <ModeSwitch
          mode={form.mode}
          recordCount={records.length}
          groupCount={groups.length}
          onMode={form.setMode}
        />
      ) : null}

      {form.several && !form.together ? (
        // Master and detail: the list on the left, one form on the right --
        // one form drawn, however many Sample IDs there are. Each side scrolls
        // on its own; on a phone they stack and scroll together.
        <div
          data-slot="bulk-identity-body"
          className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-1 py-1 sm:flex-row sm:overflow-hidden"
        >
          <GroupList
            groups={groups}
            marks={form.marks}
            visible={form.visible}
            active={shownActive}
            tools={groups.length >= COMPACT_FROM}
            query={form.query}
            onlyChanged={form.onlyChanged}
            onQuery={form.setQuery}
            onOnlyChanged={form.setOnlyChanged}
            onPick={form.setActive}
          />
          {shownActive === null ? (
            <p className="flex-1 rounded-xl border px-3 py-6 text-center text-sm text-muted-foreground">
              {t("noMatch")}
            </p>
          ) : (
            <GroupDetail
              index={shownActive}
              group={groups[shownActive]}
              position={form.position}
              visible={form.visible}
              initial={initials[shownActive]}
              state={eachStates[shownActive]}
              options={options}
              canCreate={canCreateOption}
              onPick={form.setActive}
              onChange={form.changeEach}
            />
          )}
        </div>
      ) : (
        // One form: the only part that scrolls, its repaints kept inside it.
        <div
          data-slot="bulk-identity-body"
          className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-1 [contain:content]"
        >
          {form.together ? (
            <GroupFields
              index={0}
              several
              initial={form.togetherInitial}
              state={form.togetherState}
              options={options}
              canCreate={canCreateOption}
              onChange={form.changeTogether}
            />
          ) : (
            <GroupFields
              index={0}
              several={groups[0].records.length > 1}
              initial={initials[0]}
              state={eachStates[0]}
              options={options}
              canCreate={canCreateOption}
              onChange={form.changeEach}
            />
          )}
        </div>
      )}

      {form.shown ? (
        <IdentityPreview
          shown={form.shown}
          clashes={form.clashes}
          open={form.showPreview}
          checking={form.checking}
          recordCount={records.length}
        />
      ) : null}

      <IdentityFooter
        status={form.status}
        checking={form.checking}
        shown={form.shown}
        clashCount={form.clashes.length}
        showPreview={form.showPreview}
        previewOpen={form.previewOpen}
        otherModeChanged={form.otherModeChanged}
        ready={form.ready}
        busy={busy}
        recordCount={records.length}
        onPreviewOpen={form.setPreviewOpen}
        onCancel={onCancel}
        onSave={() => void form.save()}
      />
    </>
  );
}
