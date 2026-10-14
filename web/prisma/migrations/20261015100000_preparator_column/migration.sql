-- The person who recorded a stage is the preparator, and the column says so.
--
-- The foreign key and the index are renamed along with the column, to the
-- names Prisma derives from it, so the schema and the database agree.

ALTER TABLE `sample_logs` DROP FOREIGN KEY `sample_logs_operator_id_fkey`;
ALTER TABLE `sample_logs` RENAME COLUMN `operator_id` TO `preparator_id`;
ALTER TABLE `sample_logs` RENAME INDEX `sample_logs_operator_id_scanned_at_idx` TO `sample_logs_preparator_id_scanned_at_idx`;
ALTER TABLE `sample_logs` ADD CONSTRAINT `sample_logs_preparator_id_fkey` FOREIGN KEY (`preparator_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- The development preparator's account, renamed where it already exists, so
-- the seed finds it by its new address instead of creating a second one.
UPDATE `users` SET `email` = 'preparator@atara.local', `name` = 'Field Preparator'
WHERE `email` = 'operator@atara.local';
