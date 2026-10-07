-- Four roles instead of two.
--
-- ADMIN and OPERATOR keep their names and their rows: every existing account
-- stays what it was. DATABASE (barcodes, labels, the sample database) and
-- ANALISIS (assay results) are new. What each role may do lives in
-- src/lib/permissions.ts.
--
-- The new members go between the old two on purpose: MySQL sorts an ENUM by
-- its position, and the users list orders by role, so this is the order the
-- list reads in. MySQL maps existing rows by value, not by position, so
-- reordering keeps every account's role; it does rebuild the table, which is
-- nothing at the size of a users table.

ALTER TABLE `users` MODIFY `role` ENUM('ADMIN', 'DATABASE', 'ANALISIS', 'OPERATOR') NOT NULL DEFAULT 'OPERATOR';
