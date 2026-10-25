-- Eksplorasi: the CRM List menu -- the reference values QC samples are
-- judged against, one table per check: the standards (expected value and SD
-- per element, by test method), the blank's preferred values, and the
-- duplicate's R² / RPD limits. Values stay varchar as the lab writes them,
-- like eksplorasi_data_source. New tables only; nothing existing changes.
-- CreateTable
CREATE TABLE `eksplorasi_crm_list_standart` (
    `id` VARCHAR(191) NOT NULL,
    `standard` VARCHAR(50) NOT NULL,
    `test_method` VARCHAR(50) NOT NULL,
    `ni` VARCHAR(20) NULL,
    `co` VARCHAR(20) NULL,
    `fe2o3` VARCHAR(20) NULL,
    `al2o3` VARCHAR(20) NULL,
    `cr2o3` VARCHAR(20) NULL,
    `mgo` VARCHAR(20) NULL,
    `sio2` VARCHAR(20) NULL,
    `sd_ni` VARCHAR(20) NULL,
    `sd_co` VARCHAR(20) NULL,
    `sd_fe2o3` VARCHAR(20) NULL,
    `sd_al2o3` VARCHAR(20) NULL,
    `sd_cr2o3` VARCHAR(20) NULL,
    `sd_mgo` VARCHAR(20) NULL,
    `sd_sio2` VARCHAR(20) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `updated_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `eksplorasi_crm_list_standart_standard_test_method_key`(`standard`, `test_method`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `eksplorasi_crm_list_blank` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(50) NOT NULL,
    `ni` VARCHAR(20) NULL,
    `co` VARCHAR(20) NULL,
    `fe2o3` VARCHAR(20) NULL,
    `cr2o3` VARCHAR(20) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `updated_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `eksplorasi_crm_list_blank_label_key`(`label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `eksplorasi_crm_list_duplicate` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(50) NOT NULL,
    `r2` VARCHAR(20) NULL,
    `rpd` VARCHAR(20) NULL,
    `over_rpd` VARCHAR(20) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `updated_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `eksplorasi_crm_list_duplicate_label_key`(`label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `eksplorasi_crm_list_standart` ADD CONSTRAINT `eksplorasi_crm_list_standart_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `core_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eksplorasi_crm_list_standart` ADD CONSTRAINT `eksplorasi_crm_list_standart_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `core_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eksplorasi_crm_list_blank` ADD CONSTRAINT `eksplorasi_crm_list_blank_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `core_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eksplorasi_crm_list_blank` ADD CONSTRAINT `eksplorasi_crm_list_blank_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `core_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eksplorasi_crm_list_duplicate` ADD CONSTRAINT `eksplorasi_crm_list_duplicate_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `core_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eksplorasi_crm_list_duplicate` ADD CONSTRAINT `eksplorasi_crm_list_duplicate_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `core_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

