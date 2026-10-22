-- Prefix every table with the module that owns it (core_, lab_, eksplorasi_,
-- system_), matching src/modules/<m> and prisma/schema/<m>.prisma, so the
-- database stays readable as modules are added. lab_records, lab_record_audits
-- and lab_settings already carry the prefix and keep their names.
--
-- Data-safe: tables are renamed, never dropped. MySQL moves the foreign keys
-- that point at a renamed table along with it; the rest only renames the
-- indexes and constraints Prisma derives from the table name.

-- RenameTable (one atomic statement)
RENAME TABLE
  `users` TO `core_users`,
  `user_sessions` TO `core_user_sessions`,
  `sign_in_audits` TO `core_sign_in_audits`,
  `face_enrollments` TO `core_face_enrollments`,
  `spent_challenges` TO `core_spent_challenges`,
  `master_options` TO `lab_master_options`,
  `stages` TO `lab_stages`,
  `samples` TO `lab_samples`,
  `sample_logs` TO `lab_sample_logs`,
  `allocation_locks` TO `lab_allocation_locks`,
  `drill_holes` TO `eksplorasi_drill_holes`,
  `role_password_defaults` TO `system_role_password_defaults`,
  `announcements` TO `system_announcements`;

-- DropForeignKey
ALTER TABLE `core_face_enrollments` DROP FOREIGN KEY `face_enrollments_created_by_fkey`;

-- DropForeignKey
ALTER TABLE `core_face_enrollments` DROP FOREIGN KEY `face_enrollments_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `core_sign_in_audits` DROP FOREIGN KEY `sign_in_audits_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `core_user_sessions` DROP FOREIGN KEY `user_sessions_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `core_users` DROP FOREIGN KEY `users_face_consent_by_fkey`;

-- DropForeignKey
ALTER TABLE `core_users` DROP FOREIGN KEY `users_totp_requested_by_fkey`;

-- DropForeignKey
ALTER TABLE `eksplorasi_drill_holes` DROP FOREIGN KEY `drill_holes_created_by_fkey`;

-- DropForeignKey
ALTER TABLE `eksplorasi_drill_holes` DROP FOREIGN KEY `drill_holes_updated_by_fkey`;

-- DropForeignKey
ALTER TABLE `lab_sample_logs` DROP FOREIGN KEY `sample_logs_preparator_id_fkey`;

-- DropForeignKey
ALTER TABLE `lab_sample_logs` DROP FOREIGN KEY `sample_logs_sample_id_fkey`;

-- DropForeignKey
ALTER TABLE `lab_sample_logs` DROP FOREIGN KEY `sample_logs_stage_id_fkey`;

-- DropForeignKey
ALTER TABLE `lab_samples` DROP FOREIGN KEY `samples_created_by_fkey`;

-- DropForeignKey
ALTER TABLE `lab_samples` DROP FOREIGN KEY `samples_current_stage_id_fkey`;

-- DropForeignKey
ALTER TABLE `lab_samples` DROP FOREIGN KEY `samples_deleted_by_fkey`;

-- DropForeignKey
ALTER TABLE `system_announcements` DROP FOREIGN KEY `announcements_created_by_fkey`;

-- DropForeignKey
ALTER TABLE `system_role_password_defaults` DROP FOREIGN KEY `role_password_defaults_updated_by_fkey`;

-- AddForeignKey
ALTER TABLE `core_users` ADD CONSTRAINT `core_users_face_consent_by_fkey` FOREIGN KEY (`face_consent_by`) REFERENCES `core_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_users` ADD CONSTRAINT `core_users_totp_requested_by_fkey` FOREIGN KEY (`totp_requested_by`) REFERENCES `core_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_user_sessions` ADD CONSTRAINT `core_user_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `core_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_sign_in_audits` ADD CONSTRAINT `core_sign_in_audits_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `core_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_face_enrollments` ADD CONSTRAINT `core_face_enrollments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `core_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_face_enrollments` ADD CONSTRAINT `core_face_enrollments_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `core_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eksplorasi_drill_holes` ADD CONSTRAINT `eksplorasi_drill_holes_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `core_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eksplorasi_drill_holes` ADD CONSTRAINT `eksplorasi_drill_holes_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `core_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_samples` ADD CONSTRAINT `lab_samples_current_stage_id_fkey` FOREIGN KEY (`current_stage_id`) REFERENCES `lab_stages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_samples` ADD CONSTRAINT `lab_samples_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `core_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_samples` ADD CONSTRAINT `lab_samples_deleted_by_fkey` FOREIGN KEY (`deleted_by`) REFERENCES `core_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_sample_logs` ADD CONSTRAINT `lab_sample_logs_sample_id_fkey` FOREIGN KEY (`sample_id`) REFERENCES `lab_samples`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_sample_logs` ADD CONSTRAINT `lab_sample_logs_stage_id_fkey` FOREIGN KEY (`stage_id`) REFERENCES `lab_stages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_sample_logs` ADD CONSTRAINT `lab_sample_logs_preparator_id_fkey` FOREIGN KEY (`preparator_id`) REFERENCES `core_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `system_role_password_defaults` ADD CONSTRAINT `system_role_password_defaults_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `core_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `system_announcements` ADD CONSTRAINT `system_announcements_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `core_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `core_face_enrollments` RENAME INDEX `face_enrollments_user_id_idx` TO `core_face_enrollments_user_id_idx`;

-- RenameIndex
ALTER TABLE `core_sign_in_audits` RENAME INDEX `sign_in_audits_created_at_idx` TO `core_sign_in_audits_created_at_idx`;

-- RenameIndex
ALTER TABLE `core_sign_in_audits` RENAME INDEX `sign_in_audits_outcome_created_at_idx` TO `core_sign_in_audits_outcome_created_at_idx`;

-- RenameIndex
ALTER TABLE `core_sign_in_audits` RENAME INDEX `sign_in_audits_user_id_created_at_idx` TO `core_sign_in_audits_user_id_created_at_idx`;

-- RenameIndex
ALTER TABLE `core_spent_challenges` RENAME INDEX `spent_challenges_expires_at_idx` TO `core_spent_challenges_expires_at_idx`;

-- RenameIndex
ALTER TABLE `core_user_sessions` RENAME INDEX `user_sessions_user_id_client_ended_at_idx` TO `core_user_sessions_user_id_client_ended_at_idx`;

-- RenameIndex
ALTER TABLE `core_users` RENAME INDEX `users_department_role_idx` TO `core_users_department_role_idx`;

-- RenameIndex
ALTER TABLE `core_users` RENAME INDEX `users_email_key` TO `core_users_email_key`;

-- RenameIndex
ALTER TABLE `eksplorasi_drill_holes` RENAME INDEX `drill_holes_area_idx` TO `eksplorasi_drill_holes_area_idx`;

-- RenameIndex
ALTER TABLE `eksplorasi_drill_holes` RENAME INDEX `drill_holes_hole_id_key` TO `eksplorasi_drill_holes_hole_id_key`;

-- RenameIndex
ALTER TABLE `eksplorasi_drill_holes` RENAME INDEX `drill_holes_status_idx` TO `eksplorasi_drill_holes_status_idx`;

-- RenameIndex
ALTER TABLE `lab_master_options` RENAME INDEX `master_options_kind_code_key` TO `lab_master_options_kind_code_key`;

-- RenameIndex
ALTER TABLE `lab_master_options` RENAME INDEX `master_options_kind_is_active_sortOrder_idx` TO `lab_master_options_kind_is_active_sortOrder_idx`;

-- RenameIndex
ALTER TABLE `lab_sample_logs` RENAME INDEX `sample_logs_preparator_id_scanned_at_idx` TO `lab_sample_logs_preparator_id_scanned_at_idx`;

-- RenameIndex
ALTER TABLE `lab_sample_logs` RENAME INDEX `sample_logs_sample_id_scanned_at_idx` TO `lab_sample_logs_sample_id_scanned_at_idx`;

-- RenameIndex
ALTER TABLE `lab_sample_logs` RENAME INDEX `sample_logs_scanned_at_idx` TO `lab_sample_logs_scanned_at_idx`;

-- RenameIndex
ALTER TABLE `lab_samples` RENAME INDEX `samples_createdAt_idx` TO `lab_samples_createdAt_idx`;

-- RenameIndex
ALTER TABLE `lab_samples` RENAME INDEX `samples_current_stage_id_idx` TO `lab_samples_current_stage_id_idx`;

-- RenameIndex
ALTER TABLE `lab_samples` RENAME INDEX `samples_deleted_at_createdAt_idx` TO `lab_samples_deleted_at_createdAt_idx`;

-- RenameIndex
ALTER TABLE `lab_samples` RENAME INDEX `samples_deleted_at_status_updatedAt_idx` TO `lab_samples_deleted_at_status_updatedAt_idx`;

-- RenameIndex
ALTER TABLE `lab_samples` RENAME INDEX `samples_deleted_at_updatedAt_idx` TO `lab_samples_deleted_at_updatedAt_idx`;

-- RenameIndex
ALTER TABLE `lab_samples` RENAME INDEX `samples_sample_code_key` TO `lab_samples_sample_code_key`;

-- RenameIndex
ALTER TABLE `lab_samples` RENAME INDEX `samples_status_idx` TO `lab_samples_status_idx`;

-- RenameIndex
ALTER TABLE `lab_samples` RENAME INDEX `samples_status_stage_entered_at_idx` TO `lab_samples_status_stage_entered_at_idx`;

-- RenameIndex
ALTER TABLE `lab_samples` RENAME INDEX `samples_status_updatedAt_idx` TO `lab_samples_status_updatedAt_idx`;

-- RenameIndex
ALTER TABLE `lab_samples` RENAME INDEX `samples_updatedAt_idx` TO `lab_samples_updatedAt_idx`;

-- RenameIndex
ALTER TABLE `lab_stages` RENAME INDEX `stages_key_key` TO `lab_stages_key_key`;

-- RenameIndex
ALTER TABLE `lab_stages` RENAME INDEX `stages_sequence_order_key` TO `lab_stages_sequence_order_key`;

-- RenameIndex
ALTER TABLE `system_announcements` RENAME INDEX `announcements_starts_at_ends_at_idx` TO `system_announcements_starts_at_ends_at_idx`;


-- RenameIndex (only where present): a foreign key's index that MySQL created
-- itself is renamed with the new constraint, but one restored from a dump is
-- an ordinary index and keeps the old name. Rename it when it is still there.
-- Plain SQL, no procedure: prepare the RENAME or a no-op.
SET @rename = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'core_users' AND index_name = 'users_face_consent_by_fkey') > 0, 'ALTER TABLE `core_users` RENAME INDEX `users_face_consent_by_fkey` TO `core_users_face_consent_by_fkey`', 'DO 0');
PREPARE rename_stmt FROM @rename; EXECUTE rename_stmt; DEALLOCATE PREPARE rename_stmt;
SET @rename = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'core_users' AND index_name = 'users_totp_requested_by_fkey') > 0, 'ALTER TABLE `core_users` RENAME INDEX `users_totp_requested_by_fkey` TO `core_users_totp_requested_by_fkey`', 'DO 0');
PREPARE rename_stmt FROM @rename; EXECUTE rename_stmt; DEALLOCATE PREPARE rename_stmt;
SET @rename = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'core_face_enrollments' AND index_name = 'face_enrollments_created_by_fkey') > 0, 'ALTER TABLE `core_face_enrollments` RENAME INDEX `face_enrollments_created_by_fkey` TO `core_face_enrollments_created_by_fkey`', 'DO 0');
PREPARE rename_stmt FROM @rename; EXECUTE rename_stmt; DEALLOCATE PREPARE rename_stmt;
SET @rename = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'eksplorasi_drill_holes' AND index_name = 'drill_holes_created_by_fkey') > 0, 'ALTER TABLE `eksplorasi_drill_holes` RENAME INDEX `drill_holes_created_by_fkey` TO `eksplorasi_drill_holes_created_by_fkey`', 'DO 0');
PREPARE rename_stmt FROM @rename; EXECUTE rename_stmt; DEALLOCATE PREPARE rename_stmt;
SET @rename = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'eksplorasi_drill_holes' AND index_name = 'drill_holes_updated_by_fkey') > 0, 'ALTER TABLE `eksplorasi_drill_holes` RENAME INDEX `drill_holes_updated_by_fkey` TO `eksplorasi_drill_holes_updated_by_fkey`', 'DO 0');
PREPARE rename_stmt FROM @rename; EXECUTE rename_stmt; DEALLOCATE PREPARE rename_stmt;
SET @rename = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'lab_samples' AND index_name = 'samples_created_by_fkey') > 0, 'ALTER TABLE `lab_samples` RENAME INDEX `samples_created_by_fkey` TO `lab_samples_created_by_fkey`', 'DO 0');
PREPARE rename_stmt FROM @rename; EXECUTE rename_stmt; DEALLOCATE PREPARE rename_stmt;
SET @rename = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'lab_samples' AND index_name = 'samples_deleted_by_fkey') > 0, 'ALTER TABLE `lab_samples` RENAME INDEX `samples_deleted_by_fkey` TO `lab_samples_deleted_by_fkey`', 'DO 0');
PREPARE rename_stmt FROM @rename; EXECUTE rename_stmt; DEALLOCATE PREPARE rename_stmt;
SET @rename = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'lab_sample_logs' AND index_name = 'sample_logs_stage_id_fkey') > 0, 'ALTER TABLE `lab_sample_logs` RENAME INDEX `sample_logs_stage_id_fkey` TO `lab_sample_logs_stage_id_fkey`', 'DO 0');
PREPARE rename_stmt FROM @rename; EXECUTE rename_stmt; DEALLOCATE PREPARE rename_stmt;
SET @rename = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'system_announcements' AND index_name = 'announcements_created_by_fkey') > 0, 'ALTER TABLE `system_announcements` RENAME INDEX `announcements_created_by_fkey` TO `system_announcements_created_by_fkey`', 'DO 0');
PREPARE rename_stmt FROM @rename; EXECUTE rename_stmt; DEALLOCATE PREPARE rename_stmt;
SET @rename = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'system_role_password_defaults' AND index_name = 'role_password_defaults_updated_by_fkey') > 0, 'ALTER TABLE `system_role_password_defaults` RENAME INDEX `role_password_defaults_updated_by_fkey` TO `system_role_password_defaults_updated_by_fkey`', 'DO 0');
PREPARE rename_stmt FROM @rename; EXECUTE rename_stmt; DEALLOCATE PREPARE rename_stmt;
