-- One signed-in device per slot (web, mobile) per account.
--
-- Session tokens now name a row here, and a request is good only while its
-- row has not ended. A sign-in on a new device ends the previous row in the
-- same slot (REPLACED), which is how the old device finds out and is told why.
-- Tokens issued before this migration carry no session id and stop working:
-- everybody signs in once more.
--
-- Generated with `prisma migrate diff` against the schema.

-- AlterTable
ALTER TABLE `sign_in_audits` MODIFY `outcome` ENUM('PASSWORD_FAILED', 'ACCOUNT_LOCKED', 'ACCOUNT_INACTIVE', 'PASSWORD_ONLY', 'FACE_UNREADABLE', 'FACE_MISMATCH', 'FACE_SERVICE_DOWN', 'FACE_VERIFIED', 'TOTP_ENROLLED', 'TOTP_VERIFIED', 'TOTP_MISMATCH', 'SESSION_REPLACED') NOT NULL;

-- CreateTable
CREATE TABLE `user_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `client` ENUM('WEB', 'MOBILE') NOT NULL,
    `device` VARCHAR(120) NULL,
    `address` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ended_at` DATETIME(3) NULL,
    `ended_reason` ENUM('REPLACED', 'LOGOUT') NULL,
    `replaced_by` VARCHAR(191) NULL,

    INDEX `user_sessions_user_id_client_ended_at_idx`(`user_id`, `client`, `ended_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
