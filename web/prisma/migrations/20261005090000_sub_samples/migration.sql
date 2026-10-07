-- Sub-samples.
--
-- A fraction of a sample -- "LAM/SAP/S4/B24/3475.3 (-20)" -- is assayed on
-- its own, so it is a lab record of its own, pointing at the record it was
-- taken from. It has no barcode of its own (sample_id stays empty, and the
-- unique index on it still allows one record per barcode) and no place in the
-- day's run of lab codes (sequence stays empty, and the unique index on
-- shift_date + sequence keeps holding for every record that has one).
ALTER TABLE `lab_records`
  MODIFY `sample_id` VARCHAR(191) NULL,
  MODIFY `sequence` INTEGER NULL,
  ADD COLUMN `parent_id` VARCHAR(191) NULL,
  ADD COLUMN `sub_code` VARCHAR(32) NULL;

-- One sub per code under each parent: pasting "(-20)" twice fills the same one.
CREATE UNIQUE INDEX `lab_records_parent_id_sub_code_key` ON `lab_records`(`parent_id`, `sub_code`);
CREATE INDEX `lab_records_parent_id_idx` ON `lab_records`(`parent_id`);

-- A parent removed takes its subs with it.
ALTER TABLE `lab_records`
  ADD CONSTRAINT `lab_records_parent_id_fkey`
  FOREIGN KEY (`parent_id`) REFERENCES `lab_records`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
