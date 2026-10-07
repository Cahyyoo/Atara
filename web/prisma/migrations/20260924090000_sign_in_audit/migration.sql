-- Every sign-in attempt against a real account.
--
-- The face step was built for non-repudiation and until now left no trace: a
-- session cookie proves somebody held a password, and nothing said whether a
-- face was checked as well. That difference is the whole point of the feature,
-- so it is recorded rather than inferred.
--
-- It also removes the reason sign-in refuses outright when the dlib service is
-- down. That refusal exists because a silent fall back to one factor would
-- have left nothing to show it had happened; with this table there is
-- somewhere to show it. The behaviour is deliberately NOT changed here --
-- turning a hard refusal into a soft one is a decision to take on purpose, not
-- a side effect of adding a log.
--
-- Attempts against addresses matching no account are deliberately absent.
-- They are not events in anybody's history, the rate limiter already bounds
-- them, and storing what was typed would eventually write somebody's password
-- into this table: people do type them into the email field.
CREATE TABLE `sign_in_audits` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `outcome` ENUM(
    'PASSWORD_FAILED',
    'ACCOUNT_LOCKED',
    'ACCOUNT_INACTIVE',
    'PASSWORD_ONLY',
    'FACE_UNREADABLE',
    'FACE_MISMATCH',
    'FACE_SERVICE_DOWN',
    'FACE_VERIFIED'
  ) NOT NULL,

  -- Stored, never derived from `outcome`, so that adding an outcome later
  -- cannot quietly make it count as a verified face.
  `face_verified` BOOLEAN NOT NULL DEFAULT false,

  -- Null whenever TRUST_PROXY is unset: x-forwarded-for is the caller's to
  -- write, and a column that quietly lies is worse than one that admits it
  -- does not know.
  `address` VARCHAR(64) NULL,

  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  -- One index per question actually asked: "what happened to this account"
  -- and "what happened this morning".
  INDEX `sign_in_audits_user_id_created_at_idx`(`user_id`, `created_at`),
  INDEX `sign_in_audits_created_at_idx`(`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CASCADE for the same reason face_enrollments does it: deleting an account
-- must not leave rows behind pointing at somebody who no longer exists.
--
-- It does mean the trail goes with them. That is the right way round here --
-- the audit exists to attribute actions to a person, and a person who has been
-- erased under UU PDP No. 27/2022 is exactly who must not stay attributable.
ALTER TABLE `sign_in_audits`
  ADD CONSTRAINT `sign_in_audits_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
