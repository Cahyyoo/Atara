-- Sorting and filtering indexes for the sample list, the export and analytics.
-- `samples` keeps createdAt/updatedAt unmapped, so the columns are camelCase.
CREATE INDEX `samples_status_updatedAt_idx` ON `samples`(`status`, `updatedAt`);
CREATE INDEX `samples_updatedAt_idx` ON `samples`(`updatedAt`);
CREATE INDEX `samples_createdAt_idx` ON `samples`(`createdAt`);

-- Replaces the single-column index: (sample_id, scanned_at) also covers
-- lookups by sample_id alone, and removes the filesort when logs are paired.
CREATE INDEX `sample_logs_sample_id_scanned_at_idx` ON `sample_logs`(`sample_id`, `scanned_at`);
DROP INDEX `sample_logs_sample_id_idx` ON `sample_logs`;
