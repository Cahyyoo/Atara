-- CreateTable
CREATE TABLE `lab_records` (
    `id` VARCHAR(191) NOT NULL,
    `sample_id` VARCHAR(191) NOT NULL,
    `lab_code` VARCHAR(191) NOT NULL,
    `code_type` ENUM('LAM', 'MOL') NOT NULL,
    `shift_date` DATE NOT NULL,
    `sequence` INTEGER NOT NULL,
    `ni` DECIMAL(9, 3) NULL,
    `fe` DECIMAL(9, 3) NULL,
    `co` DECIMAL(9, 3) NULL,
    `sio2` DECIMAL(9, 3) NULL,
    `mgo` DECIMAL(9, 3) NULL,
    `cao` DECIMAL(9, 3) NULL,
    `al2o3` DECIMAL(9, 3) NULL,
    `moisture` DECIMAL(9, 3) NULL,
    `weight` DECIMAL(9, 3) NULL,
    `remarks` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `lab_records_sample_id_key`(`sample_id`),
    UNIQUE INDEX `lab_records_lab_code_key`(`lab_code`),
    INDEX `lab_records_shift_date_idx`(`shift_date`),
    UNIQUE INDEX `lab_records_code_type_shift_date_sequence_key`(`code_type`, `shift_date`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lab_records` ADD CONSTRAINT `lab_records_sample_id_fkey` FOREIGN KEY (`sample_id`) REFERENCES `samples`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
