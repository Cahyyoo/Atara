-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'OPERATOR') NOT NULL DEFAULT 'OPERATOR',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stages` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sequence_order` INTEGER NOT NULL,
    `description` TEXT NULL,

    UNIQUE INDEX `stages_sequence_order_key`(`sequence_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `samples` (
    `id` VARCHAR(191) NOT NULL,
    `sample_code` VARCHAR(191) NOT NULL,
    `batch_name` VARCHAR(191) NOT NULL,
    `current_stage_id` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `created_by` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `samples_sample_code_key`(`sample_code`),
    INDEX `samples_status_idx`(`status`),
    INDEX `samples_current_stage_id_idx`(`current_stage_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sample_logs` (
    `id` VARCHAR(191) NOT NULL,
    `sample_id` VARCHAR(191) NOT NULL,
    `stage_id` VARCHAR(191) NOT NULL,
    `operator_id` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `scanned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sample_logs_sample_id_idx`(`sample_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `samples` ADD CONSTRAINT `samples_current_stage_id_fkey` FOREIGN KEY (`current_stage_id`) REFERENCES `stages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `samples` ADD CONSTRAINT `samples_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sample_logs` ADD CONSTRAINT `sample_logs_sample_id_fkey` FOREIGN KEY (`sample_id`) REFERENCES `samples`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sample_logs` ADD CONSTRAINT `sample_logs_stage_id_fkey` FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sample_logs` ADD CONSTRAINT `sample_logs_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
