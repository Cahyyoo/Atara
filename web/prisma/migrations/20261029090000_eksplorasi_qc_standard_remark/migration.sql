-- CreateTable
CREATE TABLE `eksplorasi_qc_standard_remark` (
    `id` VARCHAR(191) NOT NULL,
    `standard_key` VARCHAR(50) NOT NULL,
    `element` VARCHAR(10) NOT NULL,
    `remarks` VARCHAR(500) NOT NULL,
    `updated_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `eksplorasi_qc_standard_remark_standard_key_element_key`(`standard_key`, `element`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `eksplorasi_qc_standard_remark` ADD CONSTRAINT `eksplorasi_qc_standard_remark_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `core_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

