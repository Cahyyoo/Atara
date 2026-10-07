-- AlterTable
ALTER TABLE `lab_records` ADD COLUMN `updated_by` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `lab_record_audits` (
    `id` VARCHAR(191) NOT NULL,
    `lab_record_id` VARCHAR(191) NOT NULL,
    `changed_by` VARCHAR(191) NOT NULL,
    `changes` JSON NOT NULL,
    `reason` TEXT NULL,
    `changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `lab_record_audits_lab_record_id_idx`(`lab_record_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lab_records` ADD CONSTRAINT `lab_records_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_record_audits` ADD CONSTRAINT `lab_record_audits_lab_record_id_fkey` FOREIGN KEY (`lab_record_id`) REFERENCES `lab_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_record_audits` ADD CONSTRAINT `lab_record_audits_changed_by_fkey` FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
