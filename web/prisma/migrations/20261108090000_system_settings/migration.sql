-- CreateTable
CREATE TABLE `system_settings` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(191) NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- The mobile server address moved from the lab admin to the super admin. Carry
-- over what a server already holds, so phones are not sent back to their
-- built-in address and the installation keeps its id.
INSERT INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`)
SELECT `key`, `value`, `updated_at`, `updated_by`
FROM `lab_settings`
WHERE `key` IN ('mobileServerUrl', 'serverId');

DELETE FROM `lab_settings` WHERE `key` IN ('mobileServerUrl', 'serverId');
