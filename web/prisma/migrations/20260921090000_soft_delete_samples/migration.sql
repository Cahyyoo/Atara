-- Soft delete for samples.
--
-- A sample is the container in front of someone, its scan history and its
-- assay results at once, so removing one is undone rather than mourned.
--
-- The unique indexes on lab_code and sample_ident are deliberately left as
-- they are: a deleted row keeps holding its identity, because the printed
-- label still exists on a container somewhere and a second sample must not be
-- able to claim it.
ALTER TABLE `samples`
  ADD COLUMN `deleted_at` DATETIME(3) NULL,
  ADD COLUMN `deleted_by` VARCHAR(191) NULL;

-- Every list, export and analytics window filters on this now.
CREATE INDEX `samples_deleted_at_idx` ON `samples`(`deleted_at`);

ALTER TABLE `samples`
  ADD CONSTRAINT `samples_deleted_by_fkey`
  FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
