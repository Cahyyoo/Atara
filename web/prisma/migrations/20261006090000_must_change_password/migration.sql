-- A password an administrator chose is replaced by its owner on their next
-- sign-in on the web. Existing accounts are not affected: they start false.
ALTER TABLE `users`
  ADD COLUMN `must_change_password` BOOLEAN NOT NULL DEFAULT false;
