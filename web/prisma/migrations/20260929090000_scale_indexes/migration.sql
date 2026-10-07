-- Indexes for the queries that run on every page of every list.
--
-- Every sample list, export and analytics window filters on deleted_at IS NULL
-- and then sorts or ranges on one more column. The lone deleted_at index could
-- only ever answer "all of them" (the predicate matches ~100% of rows), so each
-- of those queries scanned the table and sorted it; these serve the filter and
-- the sort in one pass. All CREATE INDEX statements here are online in InnoDB.

CREATE INDEX `samples_deleted_at_updatedAt_idx` ON `samples`(`deleted_at`, `updatedAt`);
CREATE INDEX `samples_deleted_at_status_updatedAt_idx` ON `samples`(`deleted_at`, `status`, `updatedAt`);
CREATE INDEX `samples_deleted_at_createdAt_idx` ON `samples`(`deleted_at`, `createdAt`);

-- Stage activity sorts on scanned_at with no operator chosen, and filters a
-- shift day on it. Neither existing index on sample_logs starts with it.
CREATE INDEX `sample_logs_scanned_at_idx` ON `sample_logs`(`scanned_at`);

-- The sign-in trail's per-outcome summary and its outcome filter.
CREATE INDEX `sign_in_audits_outcome_created_at_idx` ON `sign_in_audits`(`outcome`, `created_at`);

-- Replaced by the composites above; see the note at the top.
DROP INDEX `samples_deleted_at_idx` ON `samples`;
