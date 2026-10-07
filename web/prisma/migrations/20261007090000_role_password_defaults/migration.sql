-- The password each role's new accounts start on, and that a forgotten
-- password is reset to. Hashed; empty until an administrator sets them.
CREATE TABLE `role_password_defaults` (
    `role` ENUM('ADMIN', 'DATABASE', 'ANALISIS', 'OPERATOR') NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(191) NULL,

    PRIMARY KEY (`role`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `role_password_defaults` ADD CONSTRAINT `role_password_defaults_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
