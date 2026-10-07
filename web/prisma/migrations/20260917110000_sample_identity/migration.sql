-- The field identity a Sample ID is composed from.
--
-- All nullable: a sample exists from the moment its barcode is generated, long
-- before anyone knows which barging run it will leave on, so the identity is
-- filled in later.
ALTER TABLE `lab_records`
    ADD COLUMN `place_id` VARCHAR(191) NULL,
    ADD COLUMN `rock_type_id` VARCHAR(191) NULL,
    ADD COLUMN `non_prod_id` VARCHAR(191) NULL,
    ADD COLUMN `pit_id` VARCHAR(191) NULL,
    ADD COLUMN `sir_id` VARCHAR(191) NULL,
    ADD COLUMN `barging_no` VARCHAR(191) NULL,
    ADD COLUMN `sequence_no` INTEGER NULL,
    ADD COLUMN `sample_no` INTEGER NULL,
    ADD COLUMN `sack_count` INTEGER NULL,
    ADD COLUMN `sample_ident` VARCHAR(191) NULL;

-- Unique so the same physical sample cannot be recorded twice, and so pasted
-- spreadsheet rows match exactly one record.
CREATE UNIQUE INDEX `lab_records_sample_ident_key` ON `lab_records`(`sample_ident`);

ALTER TABLE `lab_records`
    ADD CONSTRAINT `lab_records_place_id_fkey` FOREIGN KEY (`place_id`) REFERENCES `master_options`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `lab_records_rock_type_id_fkey` FOREIGN KEY (`rock_type_id`) REFERENCES `master_options`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `lab_records_non_prod_id_fkey` FOREIGN KEY (`non_prod_id`) REFERENCES `master_options`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `lab_records_pit_id_fkey` FOREIGN KEY (`pit_id`) REFERENCES `master_options`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `lab_records_sir_id_fkey` FOREIGN KEY (`sir_id`) REFERENCES `master_options`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
