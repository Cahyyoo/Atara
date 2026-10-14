-- OPERATOR is renamed PREPARATOR: the people who scan samples through the
-- stages are the lab's sample preparators, and that is what they are called.
--
-- MySQL cannot rename an enum value in place, so this widens the enum to hold
-- both names, moves every row across, then narrows it to the new name alone.
-- Announcements keep their audience as JSON role names, so those move too.

ALTER TABLE `users` MODIFY `role` ENUM('SUPER_ADMIN', 'ADMIN', 'DATABASE', 'ANALISIS', 'OPERATOR', 'PREPARATOR') NOT NULL DEFAULT 'OPERATOR';
ALTER TABLE `role_password_defaults` MODIFY `role` ENUM('SUPER_ADMIN', 'ADMIN', 'DATABASE', 'ANALISIS', 'OPERATOR', 'PREPARATOR') NOT NULL;

UPDATE `users` SET `role` = 'PREPARATOR' WHERE `role` = 'OPERATOR';
UPDATE `role_password_defaults` SET `role` = 'PREPARATOR' WHERE `role` = 'OPERATOR';
UPDATE `announcements`
SET `roles` = CAST(REPLACE(CAST(`roles` AS CHAR), '"OPERATOR"', '"PREPARATOR"') AS JSON)
WHERE `roles` IS NOT NULL;

ALTER TABLE `users` MODIFY `role` ENUM('SUPER_ADMIN', 'ADMIN', 'DATABASE', 'ANALISIS', 'PREPARATOR') NOT NULL DEFAULT 'PREPARATOR';
ALTER TABLE `role_password_defaults` MODIFY `role` ENUM('SUPER_ADMIN', 'ADMIN', 'DATABASE', 'ANALISIS', 'PREPARATOR') NOT NULL;
