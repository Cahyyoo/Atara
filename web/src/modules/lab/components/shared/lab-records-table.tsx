"use client";

import { useTranslations } from "next-intl";
import { Table } from "@/core/components/ui/table";
import { TableRefreshing } from "@/core/components/ui/table-refreshing";
import { TablePagination } from "@/core/components/table/table-toolbar";
import { EMPTY_LAYOUT } from "@/core/hooks/use-table-layout";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { DEFAULT_PAGE_SIZE, isFilteredBy, pinSampleClass } from "@/modules/lab/components/shared/lab-records-table/columns";
import type { LabRecordsAccess } from "@/modules/lab/components/shared/lab-records-table/types";
import { useLabRecordsQuery } from "@/modules/lab/components/shared/lab-records-table/use-lab-records-query";
import { useRecordsLayout } from "@/modules/lab/components/shared/lab-records-table/use-records-layout";
import { useSubFolds } from "@/modules/lab/components/shared/lab-records-table/use-sub-folds";
import { useRecordSelection } from "@/modules/lab/components/shared/lab-records-table/use-record-selection";
import { useRecordRemoval } from "@/modules/lab/components/shared/lab-records-table/use-record-removal";
import { useRecordDialogs } from "@/modules/lab/components/shared/lab-records-table/use-record-dialogs";
import { useFormatShiftDate } from "@/modules/lab/components/shared/lab-records-table/use-format-shift-date";
import { ColumnPicker } from "@/modules/lab/components/shared/lab-records-table/column-picker";
import { RecordsToolbar } from "@/modules/lab/components/shared/lab-records-table/records-toolbar";
import { IdentCta } from "@/modules/lab/components/shared/lab-records-table/ident-cta";
import { SelectionBar } from "@/modules/lab/components/shared/lab-records-table/selection-bar";
import { RecordsCaption } from "@/modules/lab/components/shared/lab-records-table/records-caption";
import { RecordsTableHead } from "@/modules/lab/components/shared/lab-records-table/records-table-head";
import { RecordsTableBody } from "@/modules/lab/components/shared/lab-records-table/records-table-body";
import { AssayActionsBar } from "@/modules/lab/components/shared/lab-records-table/assay-actions-bar";
import { RemoveConfirmDialog } from "@/modules/lab/components/shared/lab-records-table/remove-confirm-dialog";
import { RecordDialogs } from "@/modules/lab/components/shared/lab-records-table/record-dialogs";

export { DEFAULT_PAGE_SIZE } from "@/modules/lab/components/shared/lab-records-table/columns";
export type { LabRecordsAccess } from "@/modules/lab/components/shared/lab-records-table/types";

interface LabRecordsTableProps {
  access: LabRecordsAccess;
  /**
   * The same rows serve two jobs. "database" looks records up: a row opens its
   * detail panel, and ticked rows can be deleted. "assay" picks the samples to
   * enter results for: it opens on what still has no result, a click on a row
   * ticks it, and the ticked rows are handed to the caller.
   */
  mode?: "database" | "assay";
  /** Assay mode: paste results from Excel into the ticked rows. */
  onPaste?: (records: LabRecordListItemDTO[]) => void;
  /** Assay mode: type results for the ticked rows. */
  onEnterResults?: (records: LabRecordListItemDTO[]) => void;
  /** Assay mode: import a whole sheet, matched against every sample. */
  onImport?: () => void;
}

/**
 * The Sample Database: looking lab records up.
 *
 * One column names each row -- the barcode code, with the lab code and Sample
 * ID beneath it -- where three code columns used to compete for the job, and
 * it stays pinned while the result columns scroll past it. Everything else
 * about a row is one click away in the panel, so the table carries only what
 * is compared down a column: the day, the state, and the chosen elements.
 */
export function LabRecordsTable({
  access,
  mode = "database",
  onPaste,
  onEnterResults,
  onImport,
}: LabRecordsTableProps) {
  const isAssay = mode === "assay";
  const t = useTranslations("database");
  const tCommon = useTranslations("common");
  const loadError = tCommon("loadError");
  const query = useLabRecordsQuery(isAssay, loadError);
  const { filters, showDeleted, records, pagination, total, setError, setParams, reload } = query;

  /**
   * Ticking rows is for two things: picking samples to enter results for, and
   * removing or restoring them. Somebody who may do neither -- an administrator
   * reading the database -- gets no tick boxes at all.
   */
  const canSelect = isAssay || access.canEdit;
  const columns = useRecordsLayout(mode, canSelect, isAssay);
  const { shownColumns } = columns;
  const folds = useSubFolds(records, filters.search);
  const { rows } = folds;
  const selection = useRecordSelection({ rows, total, buildParams: query.buildParams, setError, loadError });
  const { selected, clearSelection, selectedRecords, selectedSamples, selectedSubs } = selection;
  const removal = useRecordRemoval({
    selectedSamples,
    selectedSubs,
    showDeleted,
    setError,
    loadError,
    clearSelection,
    reload,
  });
  // Whether the identity dialog is one click away: ticked rows, or the CTA.
  const bulkLikely =
    !isAssay && access.canEdit && !showDeleted && (selected.size > 0 || (filters.ident === "missing" && total > 0));
  const dialogs = useRecordDialogs(bulkLikely);

  // Sample, the movable columns, the chevron, and the tick box when there is one.
  const columnCount = 1 + shownColumns.length + (canSelect ? 1 : 0) + (isAssay ? 0 : 1);

  const formatDate = useFormatShiftDate();

  const openRecord = rows.find((record) => record.id === dialogs.openId) ?? null;
  const isFiltered = isFilteredBy(filters, isAssay);

  const pinSample = pinSampleClass(canSelect);

  return (
    <div className="flex flex-col gap-4">
      <RecordsToolbar
        access={access}
        isAssay={isAssay}
        filters={filters}
        counts={query.counts}
        showDeleted={showDeleted}
        columnPicker={
          <ColumnPicker
            visibleFields={columns.visibleFields}
            onVisibleFieldsChange={columns.setVisibleFields}
            onToggleField={columns.toggleField}
            onResetLayout={() => columns.setLayout(EMPTY_LAYOUT)}
          />
        }
        buildParams={query.buildParams}
        setError={setError}
        // A new filter means a different set of rows: what was ticked under the
        // old one is not carried over, unseen, into the new one.
        onFiltersChange={(updates) => {
          clearSelection();
          folds.setFolds(new Map());
          setParams(updates);
        }}
        onPaste={onPaste}
        onImport={onImport}
        onOpenWeights={dialogs.openWeights}
      />

      <InlineNotice tone="error">{query.error}</InlineNotice>

      {/* Only once something is ticked: an empty bar would just take up room
          above the table on every visit. */}
      {!isAssay && access.canEdit && !showDeleted && filters.ident === "missing" && total > 0 && selected.size === 0 ? (
        <IdentCta
          total={total}
          isSelectingMatching={selection.isSelectingMatching}
          onAction={async () => {
            const picked = await selection.selectAllMatching();
            if (picked && picked.length > 0) dialogs.openBulkIdentity(picked);
          }}
        />
      ) : null}

      {!isAssay && canSelect && selectedRecords.length > 0 ? (
        <SelectionBar
          canEdit={access.canEdit}
          showDeleted={showDeleted}
          selectedCount={selectedRecords.length}
          sampleCount={selectedSamples.length}
          subCount={selectedSubs.length}
          isRemoving={removal.isRemoving}
          showMatching={selection.allShownSelected && total > records.length}
          allMatchingSelected={selection.allMatchingSelected}
          isSelectingMatching={selection.isSelectingMatching}
          total={total}
          pageCount={records.length}
          onBulkIdentity={() =>
            dialogs.openBulkIdentity(selection.selectionInTableOrder.filter((record) => !record.parentId))
          }
          onClear={clearSelection}
          onConfirm={removal.setConfirming}
          onSelectAllMatching={() => void selection.selectAllMatching()}
        />
      ) : null}

      <TableRefreshing isRefreshing={query.showRefreshing}>
        <div className="rounded-lg border bg-background">
          <RecordsCaption
            total={pagination ? pagination.total : null}
            showViews={access.canViewDeleted && !isAssay}
            showDeleted={showDeleted}
            onViewChange={(deleted) => {
              clearSelection();
              setParams({ deleted: deleted ? "true" : null });
            }}
          />
          {/* Fixed layout with a width per column: the widths somebody dragged
              are the widths shown, however long the values in them are. */}
          <Table className="table-fixed" style={{ width: columns.tableWidth, minWidth: "100%" }}>
            <RecordsTableHead
              canSelect={canSelect}
              isAssay={isAssay}
              shownColumns={shownColumns}
              widthOf={columns.widthOf}
              sort={query.sort}
              order={query.order}
              onSort={(field: string) => query.toggleSort(field, query.sort, query.order)}
              dragProps={columns.dragProps}
              dragKey={columns.dragKey}
              dropKey={columns.dropKey}
              pinSample={pinSample}
              allShownSelected={selection.allShownSelected}
              noRecords={records.length === 0}
              onToggleShown={selection.toggleShown}
            />
            <RecordsTableBody
              isAssay={isAssay}
              canSelect={canSelect}
              isLoading={query.isLoading}
              hasRecords={records.length > 0}
              rows={rows}
              columnCount={columnCount}
              isFiltered={isFiltered}
              shownColumns={shownColumns}
              pinSample={pinSample}
              formatDate={formatDate}
              isSelected={(record) => selected.has(record.id)}
              isOpen={folds.isOpen}
              anySubs={folds.anySubs}
              onResetFilters={() =>
                setParams({ search: null, placeId: null, from: null, to: null, results: null, ident: null })
              }
              onPick={selection.toggleRow}
              onOpen={dialogs.openRow}
              onToggleBox={selection.toggleRowFromBox}
              onNoteShift={selection.noteShift}
              onToggleSubs={folds.toggleSubs}
              onHistory={dialogs.openHistory}
            />
          </Table>
        </div>
      </TableRefreshing>

      {isAssay && selectedRecords.length > 0 ? (
        <AssayActionsBar
          selectedRecords={selectedRecords}
          subCount={selectedSubs.length}
          isRemoving={removal.isRemoving}
          onClear={clearSelection}
          onRemoveSubs={() => removal.setConfirming("subs")}
          onPaste={onPaste}
          onEnterResults={onEnterResults}
        />
      ) : null}

      {pagination ? (
        <TablePagination
          pagination={pagination}
          shown={records.length}
          noun={t("noun")}
          pageSize={query.pageSize}
          onPageSizeChange={(value) => setParams({ pageSize: value === DEFAULT_PAGE_SIZE ? null : value })}
          onPageChange={(next) => setParams({ page: next === 1 ? null : String(next) })}
        />
      ) : null}

      <RemoveConfirmDialog
        confirming={removal.confirming}
        showDeleted={showDeleted}
        isRemoving={removal.isRemoving}
        sampleCount={selectedSamples.length}
        subCount={selectedSubs.length}
        onCancel={() => removal.setConfirming(false)}
        onRemove={removal.handleRemove}
        onRemoveSubs={removal.handleRemoveSubs}
      />

      <RecordDialogs
        dialogs={dialogs}
        openRecord={openRecord}
        canEdit={access.canEdit}
        formatDate={formatDate}
        onSaved={query.handleSaved}
        onReload={reload}
        onClearSelection={clearSelection}
      />
    </div>
  );
}
