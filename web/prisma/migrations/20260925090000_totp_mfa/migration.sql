-- An authenticator app (TOTP, RFC 6238) as the alternative second factor to
-- the face step.
--
-- The face step has one way back in when it fails -- an admin deleting the
-- enrolment -- and a dlib outage turns that into everybody's problem at once.
-- A six-digit code from a phone does not depend on the camera, the light over
-- the bench or the face service, and it is still something the person holds
-- rather than something they merely know.
--
-- The secret is sealed with MFA_ENCRYPTION_KEY before it lands here, so a copy
-- of this table alone cannot produce codes.
ALTER TABLE `users`
  ADD COLUMN `totp_secret` VARCHAR(255) NULL,
  ADD COLUMN `totp_requested_at` DATETIME(3) NULL,
  ADD COLUMN `totp_requested_by` VARCHAR(191) NULL,
  ADD COLUMN `totp_enabled_at` DATETIME(3) NULL,
  ADD COLUMN `totp_last_used_step` INTEGER NULL;

ALTER TABLE `users`
  ADD CONSTRAINT `users_totp_requested_by_fkey`
    FOREIGN KEY (`totp_requested_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- The new outcomes, appended so every existing row keeps its value.
ALTER TABLE `sign_in_audits`
  MODIFY `outcome` ENUM(
    'PASSWORD_FAILED',
    'ACCOUNT_LOCKED',
    'ACCOUNT_INACTIVE',
    'PASSWORD_ONLY',
    'FACE_UNREADABLE',
    'FACE_MISMATCH',
    'FACE_SERVICE_DOWN',
    'FACE_VERIFIED',
    'TOTP_ENROLLED',
    'TOTP_VERIFIED',
    'TOTP_MISMATCH'
  ) NOT NULL;

-- Stored beside face_verified and for the same reason: never derived from
-- `outcome`, so a later outcome cannot quietly start counting as verified.
ALTER TABLE `sign_in_audits`
  ADD COLUMN `totp_verified` BOOLEAN NOT NULL DEFAULT false;
