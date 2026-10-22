-- The eksplorasi module moves from drill holes to the assay data source: one
-- table of samples (ORIGINAL) and the QC rows among them (STANDARD, BLANK,
-- DUPLICATE), read through the Data Source, Standard, Blank and Duplicate
-- menus. Values stay varchar as the lab writes them ("<0.01" included).
--
-- Drops eksplorasi_drill_holes and what it held: the drilling menu is gone.

-- DropForeignKey
ALTER TABLE `eksplorasi_drill_holes` DROP FOREIGN KEY `eksplorasi_drill_holes_created_by_fkey`;

-- DropForeignKey
ALTER TABLE `eksplorasi_drill_holes` DROP FOREIGN KEY `eksplorasi_drill_holes_updated_by_fkey`;

-- DropTable
DROP TABLE `eksplorasi_drill_holes`;

-- CreateTable
CREATE TABLE `eksplorasi_data_source` (
    `id` VARCHAR(191) NOT NULL,
    `control_date` VARCHAR(50) NULL,
    `control` VARCHAR(100) NULL,
    `campaign` VARCHAR(100) NULL,
    `no` VARCHAR(50) NULL,
    `hole_id` VARCHAR(50) NULL,
    `sample_id` VARCHAR(50) NOT NULL,
    `sample_type` ENUM('ORIGINAL', 'STANDARD', 'BLANK', 'DUPLICATE') NOT NULL,
    `from` VARCHAR(20) NULL,
    `to` VARCHAR(20) NULL,
    `remarks` VARCHAR(500) NULL,
    `date` DATE NULL,
    `weight` VARCHAR(20) NULL,
    `ni` VARCHAR(20) NULL,
    `fe` VARCHAR(20) NULL,
    `fe2o3` VARCHAR(20) NULL,
    `co` VARCHAR(20) NULL,
    `na2o` VARCHAR(20) NULL,
    `mgo` VARCHAR(20) NULL,
    `al2o3` VARCHAR(20) NULL,
    `sio2` VARCHAR(20) NULL,
    `p2o5` VARCHAR(20) NULL,
    `so3` VARCHAR(20) NULL,
    `k2o` VARCHAR(20) NULL,
    `cao` VARCHAR(20) NULL,
    `tio2` VARCHAR(20) NULL,
    `cr2o3` VARCHAR(20) NULL,
    `mno` VARCHAR(20) NULL,
    `mc` VARCHAR(20) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `updated_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `eksplorasi_data_source_sample_id_key`(`sample_id`),
    INDEX `eksplorasi_data_source_sample_type_date_idx`(`sample_type`, `date`),
    INDEX `eksplorasi_data_source_control_idx`(`control`),
    INDEX `eksplorasi_data_source_campaign_idx`(`campaign`),
    INDEX `eksplorasi_data_source_hole_id_idx`(`hole_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `eksplorasi_data_source` ADD CONSTRAINT `eksplorasi_data_source_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `core_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eksplorasi_data_source` ADD CONSTRAINT `eksplorasi_data_source_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `core_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

