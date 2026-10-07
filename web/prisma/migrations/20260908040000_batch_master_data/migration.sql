-- Promote the free-text `samples.batch_name` to a `batches` master table.
--
-- Written by hand rather than generated, because the generated version would
-- drop a populated column: the existing names have to be lifted into the new
-- table and linked back before the old column can go.
--
-- Note: rows created here get UUID ids, while rows created later by the app get
-- cuids. Both are opaque identifiers, so the mix is cosmetic only.

-- 1. The master table.
CREATE TABLE `batches` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `batches_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. A nullable link, so existing rows stay valid while we fill it in.
ALTER TABLE `samples` ADD COLUMN `batch_id` VARCHAR(191) NULL;

-- 3. One batch per distinct name, then point every sample at its batch.
INSERT INTO `batches` (`id`, `name`, `is_active`, `createdAt`, `updatedAt`)
SELECT UUID(), `batch_name`, true, NOW(3), NOW(3)
FROM (SELECT DISTINCT `batch_name` FROM `samples`) AS existing_names;

UPDATE `samples` `s`
JOIN `batches` `b` ON `b`.`name` = `s`.`batch_name`
SET `s`.`batch_id` = `b`.`id`;

-- 4. Now that every row has one, make the link required.
ALTER TABLE `samples` MODIFY `batch_id` VARCHAR(191) NOT NULL;
CREATE INDEX `samples_batch_id_idx` ON `samples`(`batch_id`);
ALTER TABLE `samples` ADD CONSTRAINT `samples_batch_id_fkey`
    FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. The free-text column has served its purpose.
ALTER TABLE `samples` DROP COLUMN `batch_name`;
