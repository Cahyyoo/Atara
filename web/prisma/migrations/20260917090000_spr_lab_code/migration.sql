-- The SPR code carries no place prefix, so there is now one run of numbers per
-- shift day instead of one per code type.
--
-- Existing rows were numbered per code type, so a LAM and a MOL sample from the
-- same day can both hold sequence 1. They have to be renumbered before the new
-- unique key can exist.
--
-- Order matters: the old key has to go first. Renumbering while it is still in
-- place fails with a duplicate on (code_type, shift_date, sequence), because the
-- rows are rewritten one at a time and collide with their own code type midway.
DROP INDEX `lab_records_code_type_shift_date_sequence_key` ON `lab_records`;

-- Only `sequence` is renumbered. lab_code strings are left exactly as they are:
-- codes already printed on labels must keep matching. For rows created before
-- this migration the number inside the old code therefore no longer equals
-- `sequence`; from here on `sequence` answers only "what number is next today",
-- which is all the allocator reads it for.
UPDATE `lab_records` lr
JOIN (
    SELECT `id`,
           ROW_NUMBER() OVER (PARTITION BY `shift_date` ORDER BY `createdAt`, `id`) AS rn
    FROM `lab_records`
) ranked ON ranked.`id` = lr.`id`
SET lr.`sequence` = ranked.rn;

CREATE UNIQUE INDEX `lab_records_shift_date_sequence_key` ON `lab_records`(`shift_date`, `sequence`);
