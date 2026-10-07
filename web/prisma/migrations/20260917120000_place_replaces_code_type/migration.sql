-- LAM and MOL lived in two places at once: the `code_type` enum and the PLACE
-- master list. Two vocabularies for one thing only ever wait to disagree, and
-- the SPR code no longer carries the place, so the enum's last uses were the
-- Sample ID's leading segment and the dashboard split — both of which the
-- master list already serves.

-- The place every existing row already had, moved to where it now lives. Rows
-- that were given an identity by hand keep it: those already hold a place_id.
UPDATE lab_records lr
JOIN master_options mo ON mo.kind = 'PLACE' AND mo.code = lr.code_type
SET lr.place_id = mo.id
WHERE lr.place_id IS NULL;

-- Refuses to go further if any row's place was about to be dropped on the
-- floor, which would happen if someone had retired or renamed a PLACE code.
-- Division by zero fails the statement and the migration with it.
SELECT IF(
  (SELECT COUNT(*) FROM lab_records WHERE place_id IS NULL) = 0,
  1,
  (SELECT 1/0)
) INTO @place_backfill_complete;

ALTER TABLE `lab_records` DROP COLUMN `code_type`;
