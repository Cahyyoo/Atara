-- The five stages get a stable key, and the lab's own names.
--
-- Renamed in place: the rows and their ids are untouched, so every
-- sample_logs row and every samples.current_stage_id keeps pointing where it
-- pointed. The cost, accepted deliberately, is that past scans now read under
-- the new names.
ALTER TABLE `stages` ADD COLUMN `key` VARCHAR(191) NULL;

-- Matched on sequence_order rather than on the old name: the order is what
-- the workflow is, and a name could already have been edited by hand.
UPDATE `stages` SET `key` = 'RECEIVED', `name` = 'DITERIMA'    WHERE `sequence_order` = 1;
UPDATE `stages` SET `key` = 'WET_PREP', `name` = 'PREP BASAH'  WHERE `sequence_order` = 2;
UPDATE `stages` SET `key` = 'DRY_PREP', `name` = 'PREP KERING' WHERE `sequence_order` = 3;
UPDATE `stages` SET `key` = 'ANALYSIS', `name` = 'ANALISA'     WHERE `sequence_order` = 4;
UPDATE `stages` SET `key` = 'REPORT',   `name` = 'REPORT'      WHERE `sequence_order` = 5;

-- Unique, but still nullable: a stage added later may have no key yet, and
-- MySQL lets any number of rows hold NULL in a unique index.
CREATE UNIQUE INDEX `stages_key_key` ON `stages`(`key`);
