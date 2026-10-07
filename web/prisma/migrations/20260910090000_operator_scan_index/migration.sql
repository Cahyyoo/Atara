-- "What did this operator record during this shift" filters on both columns.
CREATE INDEX `sample_logs_operator_id_scanned_at_idx` ON `sample_logs`(`operator_id`, `scanned_at`);
