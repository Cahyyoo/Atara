-- What the device behind a session was, as data: kind, system and version,
-- browser and version, model, and whether it was the mobile app. The device a
-- sign-in signs out is told this, in its own language; `device` keeps the one
-- neutral line for clients that cannot render it.

ALTER TABLE `user_sessions` ADD COLUMN `device_info` JSON NULL;
