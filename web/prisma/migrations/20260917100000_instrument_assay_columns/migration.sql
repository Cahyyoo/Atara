-- The assay columns now mirror what the instrument reports.
--
-- Ten more elements, the instrument's own Sum, and the three descriptive
-- columns that come with a run.
ALTER TABLE `lab_records`
    ADD COLUMN `cr` DECIMAL(9, 3) NULL,
    ADD COLUMN `fe2o3` DECIMAL(9, 3) NULL,
    ADD COLUMN `cr2o3` DECIMAL(9, 3) NULL,
    ADD COLUMN `mno` DECIMAL(9, 3) NULL,
    ADD COLUMN `na2o` DECIMAL(9, 3) NULL,
    ADD COLUMN `p2o5` DECIMAL(9, 3) NULL,
    ADD COLUMN `tio2` DECIMAL(9, 3) NULL,
    ADD COLUMN `s` DECIMAL(9, 3) NULL,
    ADD COLUMN `co2` DECIMAL(9, 3) NULL,
    ADD COLUMN `zn` DECIMAL(9, 3) NULL,
    ADD COLUMN `sum` DECIMAL(9, 3) NULL,
    ADD COLUMN `measurement_method` VARCHAR(191) NULL,
    ADD COLUMN `solution_id` VARCHAR(191) NULL,
    ADD COLUMN `measurement_finished` DATETIME(3) NULL;

-- Moisture and weight are not part of the instrument's output and were agreed
-- to go. This drops their data and cannot be undone.
ALTER TABLE `lab_records`
    DROP COLUMN `moisture`,
    DROP COLUMN `weight`;
