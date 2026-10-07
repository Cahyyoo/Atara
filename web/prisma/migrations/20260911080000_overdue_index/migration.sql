-- The analytics overdue query filters on status and on stage_entered_at, and
-- sorts on the latter. It was reading every unfinished sample in the window.
CREATE INDEX `samples_status_stage_entered_at_idx` ON `samples`(`status`, `stage_entered_at`);
