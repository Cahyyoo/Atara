-- Batches are gone from the project, and with them the certificate feature that
-- was organised around them.
--
-- What grouped a sample is now inside its own Sample ID — the place, the pit and
-- the barging run — so a second layer naming roughly the same thing had nothing
-- left to do.
--
-- THIS DESTROYS DATA AND CANNOT BE UNDONE. Every batch name ever recorded goes
-- with the table, and no other column holds a copy. The name and the
-- sample -> batch mapping were exported to JSON before this ran.
--
-- Order matters: the foreign key holds the column, the column holds the index,
-- and the table cannot be dropped while anything still references it. Both
-- names were read from information_schema rather than assumed.
ALTER TABLE `samples` DROP FOREIGN KEY `samples_batch_id_fkey`;

DROP INDEX `samples_batch_id_idx` ON `samples`;

ALTER TABLE `samples` DROP COLUMN `batch_id`;

DROP TABLE `batches`;
