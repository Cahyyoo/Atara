-- Eksplorasi: the ordinary sample type is called FIELD, and Remarks is split
-- by the list it belongs to -- original_sample_id_remarks for the Duplicate
-- list, oreas_remarks for the Data Source, Standard and Blank lists.
-- Existing values are moved, not dropped.

-- ORIGINAL -> FIELD: widen the enum, move the rows, narrow it again.
ALTER TABLE `eksplorasi_data_source` MODIFY `sample_type` ENUM('ORIGINAL', 'FIELD', 'STANDARD', 'BLANK', 'DUPLICATE') NOT NULL;
UPDATE `eksplorasi_data_source` SET `sample_type` = 'FIELD' WHERE `sample_type` = 'ORIGINAL';
ALTER TABLE `eksplorasi_data_source` MODIFY `sample_type` ENUM('FIELD', 'STANDARD', 'BLANK', 'DUPLICATE') NOT NULL;

-- remarks -> two columns, each row's going to the list it is on.
ALTER TABLE `eksplorasi_data_source`
    ADD COLUMN `original_sample_id_remarks` VARCHAR(500) NULL AFTER `to`,
    ADD COLUMN `oreas_remarks` VARCHAR(500) NULL AFTER `original_sample_id_remarks`;
UPDATE `eksplorasi_data_source` SET `original_sample_id_remarks` = `remarks` WHERE `sample_type` = 'DUPLICATE';
UPDATE `eksplorasi_data_source` SET `oreas_remarks` = `remarks` WHERE `sample_type` <> 'DUPLICATE';
ALTER TABLE `eksplorasi_data_source` DROP COLUMN `remarks`;
