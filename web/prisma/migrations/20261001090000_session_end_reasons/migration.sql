-- Sessions can now end for two more reasons, and the sign-in trail records
-- both: an administrator ending them (from the sessions list, or by resetting
-- the password), and the owner changing their own password, which ends every
-- other device they were signed in on.

-- AlterTable
ALTER TABLE `user_sessions` MODIFY `ended_reason` ENUM('REPLACED', 'LOGOUT', 'ADMIN_ENDED', 'PASSWORD_CHANGED') NULL;

-- AlterTable
ALTER TABLE `sign_in_audits` MODIFY `outcome` ENUM('PASSWORD_FAILED', 'ACCOUNT_LOCKED', 'ACCOUNT_INACTIVE', 'PASSWORD_ONLY', 'FACE_UNREADABLE', 'FACE_MISMATCH', 'FACE_SERVICE_DOWN', 'FACE_VERIFIED', 'TOTP_ENROLLED', 'TOTP_VERIFIED', 'TOTP_MISMATCH', 'SESSION_REPLACED', 'PASSWORD_CHANGED', 'SESSION_ENDED_BY_ADMIN') NOT NULL;
