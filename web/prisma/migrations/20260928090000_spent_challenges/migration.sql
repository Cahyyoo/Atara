-- Challenges that have already been spent, so one cannot be spent twice.
--
-- This replaces a Map held inside a single Node process. That Map could only
-- promise "exactly once" to the process holding it: run a second worker, or
-- put two instances behind a load balancer, and a captured challenge could be
-- claimed again on the other one -- silently, because nothing was watching for
-- it. The comment on that Map already admitted as much.
--
-- The nonce is the primary key and that is the entire mechanism. The first
-- INSERT wins; the second fails on the key, in the database, atomically. There
-- is no read-then-write for two requests to slip between.
CREATE TABLE `spent_challenges` (
  `nonce` VARCHAR(191) NOT NULL,

  -- Issued-at plus the challenge lifetime. Swept by expiry rather than by age
  -- so that lengthening the window later cannot start forgetting rows early:
  -- keeping one a little too long is harmless, dropping one too soon is not.
  `expires_at` DATETIME(3) NOT NULL,

  INDEX `spent_challenges_expires_at_idx`(`expires_at`),
  PRIMARY KEY (`nonce`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
