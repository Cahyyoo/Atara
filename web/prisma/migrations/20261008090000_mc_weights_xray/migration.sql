-- The X-ray instrument a result was read on, and the moisture-content
-- weighing (pan, wet, dry) the Formulir Analysis Result reports MC from.
ALTER TABLE `lab_records`
  ADD COLUMN `xray_instrument` VARCHAR(191) NULL,
  ADD COLUMN `mc_wp` DECIMAL(10, 2) NULL,
  ADD COLUMN `mc_w0` DECIMAL(10, 2) NULL,
  ADD COLUMN `mc_wd` DECIMAL(10, 2) NULL;
