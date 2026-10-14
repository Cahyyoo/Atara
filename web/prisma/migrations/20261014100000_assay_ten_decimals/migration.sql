-- Results kept to ten decimal places rather than three: a trace element
-- such as Zn is reported as 0.0303, and three places stored 0.030. Four
-- digits before the point still hold Sum (at most 1000). Existing values
-- keep their figures; they only gain trailing zeros.
ALTER TABLE `lab_records`
    MODIFY `ni` DECIMAL(14, 10) NULL,
    MODIFY `fe` DECIMAL(14, 10) NULL,
    MODIFY `co` DECIMAL(14, 10) NULL,
    MODIFY `sio2` DECIMAL(14, 10) NULL,
    MODIFY `mgo` DECIMAL(14, 10) NULL,
    MODIFY `cao` DECIMAL(14, 10) NULL,
    MODIFY `al2o3` DECIMAL(14, 10) NULL,
    MODIFY `cr` DECIMAL(14, 10) NULL,
    MODIFY `fe2o3` DECIMAL(14, 10) NULL,
    MODIFY `cr2o3` DECIMAL(14, 10) NULL,
    MODIFY `mno` DECIMAL(14, 10) NULL,
    MODIFY `na2o` DECIMAL(14, 10) NULL,
    MODIFY `p2o5` DECIMAL(14, 10) NULL,
    MODIFY `tio2` DECIMAL(14, 10) NULL,
    MODIFY `s` DECIMAL(14, 10) NULL,
    MODIFY `co2` DECIMAL(14, 10) NULL,
    MODIFY `zn` DECIMAL(14, 10) NULL,
    MODIFY `sum` DECIMAL(14, 10) NULL;
