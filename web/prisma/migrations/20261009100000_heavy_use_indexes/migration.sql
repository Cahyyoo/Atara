-- The change history pages newest first across every record; without this
-- each page sorted the whole audit table.
CREATE INDEX `lab_record_audits_changed_at_id_idx` ON `lab_record_audits`(`changed_at`, `id`);

-- One row per sequence that is allocated "read the highest, add one". A
-- generation locks its row (SELECT ... FOR UPDATE) for the length of its
-- transaction, so the next one reads the highest only after the first has
-- committed. A named lock (GET_LOCK) is released before COMMIT and let the
-- next generation read past rows it could not yet see.
CREATE TABLE `allocation_locks` (
    `name` VARCHAR(64) NOT NULL,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `allocation_locks` (`name`) VALUES ('sample-codes');
