-- A paste warns when its results read exactly like another sample's. The
-- look-up compares all eighteen results; these four lead, so it reads a
-- handful of rows rather than the whole table.
CREATE INDEX `lab_records_ni_fe_sio2_mgo_idx` ON `lab_records`(`ni`, `fe`, `sio2`, `mgo`);
