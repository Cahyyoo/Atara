-- The five field vocabularies that compose a Sample ID, in one table: they have
-- the same shape, so five tables would be the same schema five times over.
CREATE TABLE `master_options` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('PLACE', 'ROCK_TYPE', 'NON_PROD', 'PIT', 'SIR') NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `master_options_kind_code_key`(`kind`, `code`),
    INDEX `master_options_kind_is_active_sortOrder_idx`(`kind`, `is_active`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
