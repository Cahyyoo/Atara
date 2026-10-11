-- Atara becomes a super app: one module per department.
--
-- SUPER_ADMIN is new and belongs to no department; it manages the admins of
-- each department. Every existing account belongs to the lab -- the only
-- module there was -- so the existing ADMIN becomes the lab's admin and keeps
-- everything it could do there. The super admin itself comes from the seed.
-- What each role may do, per department, lives in src/lib/permissions.ts.

ALTER TABLE `users` MODIFY `role` ENUM('SUPER_ADMIN', 'ADMIN', 'DATABASE', 'ANALISIS', 'OPERATOR') NOT NULL DEFAULT 'OPERATOR';
ALTER TABLE `role_password_defaults` MODIFY `role` ENUM('SUPER_ADMIN', 'ADMIN', 'DATABASE', 'ANALISIS', 'OPERATOR') NOT NULL;

ALTER TABLE `users` ADD COLUMN `department` ENUM('LAB', 'EKSPLORASI') NULL;
UPDATE `users` SET `department` = 'LAB' WHERE `role` IN ('ADMIN', 'DATABASE', 'ANALISIS', 'OPERATOR');
CREATE INDEX `users_department_role_idx` ON `users`(`department`, `role`);

-- Eksplorasi: drill holes, kept minimal for now.
CREATE TABLE `drill_holes` (
    `id` VARCHAR(191) NOT NULL,
    `hole_id` VARCHAR(50) NOT NULL,
    `area` VARCHAR(100) NULL,
    `easting` DECIMAL(12, 3) NULL,
    `northing` DECIMAL(12, 3) NULL,
    `elevation` DECIMAL(8, 2) NULL,
    `azimuth` DECIMAL(5, 2) NULL,
    `dip` DECIMAL(5, 2) NULL,
    `total_depth` DECIMAL(8, 2) NULL,
    `status` ENUM('PLANNED', 'ONGOING', 'COMPLETED', 'ABANDONED') NOT NULL DEFAULT 'PLANNED',
    `start_date` DATE NULL,
    `end_date` DATE NULL,
    `remarks` TEXT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `updated_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `drill_holes_hole_id_key`(`hole_id`),
    INDEX `drill_holes_status_idx`(`status`),
    INDEX `drill_holes_area_idx`(`area`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `drill_holes` ADD CONSTRAINT `drill_holes_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `drill_holes` ADD CONSTRAINT `drill_holes_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
