-- AlterTable
ALTER TABLE `sample_logs` ADD COLUMN `is_correction` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `samples` ADD COLUMN `stage_entered_at` DATETIME(3) NULL;

-- Backfill: existing samples entered their current stage at their last update.
UPDATE `samples` SET `stage_entered_at` = `updatedAt` WHERE `current_stage_id` IS NOT NULL;
