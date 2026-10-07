-- Face as a second factor at sign-in.
--
-- The descriptor is the 128 float32 values face-api.js produces, kept as their
-- raw 512 bytes rather than as JSON: exact, and a quarter the size. Several
-- rows per person is the normal case, because one frame only recognises the
-- lighting it was taken in.
--
-- ON DELETE CASCADE from users is deliberate. UU PDP No. 27/2022 treats
-- biometrics as specific personal data with a right to erasure, so removing an
-- account has to take the face data with it rather than leave it orphaned.
CREATE TABLE `face_enrollments` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `descriptor` LONGBLOB NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by` VARCHAR(191) NOT NULL,

  INDEX `face_enrollments_user_id_idx`(`user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `face_enrollments`
  ADD CONSTRAINT `face_enrollments_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `face_enrollments_created_by_fkey`
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Consent, recorded rather than inferred from an enrolment existing. Separate
-- so that withdrawing it is something the record can express.
ALTER TABLE `users`
  ADD COLUMN `face_consent_at` DATETIME(3) NULL,
  ADD COLUMN `face_consent_by` VARCHAR(191) NULL;

ALTER TABLE `users`
  ADD CONSTRAINT `users_face_consent_by_fkey`
    FOREIGN KEY (`face_consent_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
