-- The Sample ID goes back to the shape the lab writes on the sheet: the
-- leading group -- place, rock type, non-production code, sir -- separated by
-- spaces, and "/" from the pit onwards.
--
--     MOL LIM TP S3/PA4/B42/919.3/12
--
-- This reverts 20260918090000_slash_separated_sample_ident for the leading
-- group only. Every slash from the pit onwards stays exactly where it is, and
-- an id that is a place on its own, or a place and a tail ("MOL", "MOL/919.3",
-- "MOL/0"), is already in the new shape and is not touched.
--
-- Which slashes belong to the group is not guessed from the string. The group
-- is composed again from each record's own identity columns -- the same four
-- parts composeSampleIdent() writes, with CONCAT_WS leaving out whatever is
-- NULL -- and a row is rewritten only where the id it holds still opens with
-- exactly that group, separators aside, and ends it where the group should
-- end: at a "/" (its tail), at a " " (a sub-sample's bracket), or at the end
-- of the string. A row whose id has drifted from its columns is left alone
-- rather than mangled, which counting slashes blindly would not have managed.
--
-- Sub-samples need no special case: a sub carries copies of its parent's
-- identity columns, and its bracketed code sits at the end, past the group.
--
-- Uniqueness survives. Only separators inside the group change, so the mapping
-- is one-to-one over the existing rows; and every value this writes holds a
-- space inside its leading group, where no stored id holds one today, so no
-- rewritten row can collide with a row the statement has not reached yet.
--
-- Re-running it changes nothing: a group already written with spaces still
-- matches, and is written back exactly as it was.
--
-- The audit history keeps the ids as they were written at the time, which is
-- what a history is for. Slashes in an older entry are not a bug.

-- Each record's leading group as it should now read, with the number of
-- separators inside it. The inner join on the place is what makes the length
-- arithmetic below safe: a Sample ID cannot exist without a place, and a NULL
-- place code would shorten the group and cut the string in the wrong spot.
CREATE TEMPORARY TABLE _ident_group AS
SELECT
  r.id AS id,
  CONCAT_WS(' ',
    NULLIF(UPPER(TRIM(p.code)), ''),
    NULLIF(UPPER(TRIM(rt.code)), ''),
    NULLIF(UPPER(TRIM(np.code)), ''),
    CONCAT('S', NULLIF(UPPER(TRIM(si.code)), ''))
  ) AS spaced
FROM lab_records r
JOIN      master_options p  ON p.id  = r.place_id
LEFT JOIN master_options rt ON rt.id = r.rock_type_id
LEFT JOIN master_options np ON np.id = r.non_prod_id
LEFT JOIN master_options si ON si.id = r.sir_id
WHERE r.sample_ident IS NOT NULL
  -- A group that is the place alone holds no separator: nothing to rewrite.
  AND (r.rock_type_id IS NOT NULL OR r.non_prod_id IS NOT NULL OR r.sir_id IS NOT NULL);

UPDATE lab_records r
JOIN _ident_group g ON g.id = r.id
SET r.sample_ident = CONCAT(g.spaced, SUBSTRING(r.sample_ident, CHAR_LENGTH(g.spaced) + 1))
WHERE CHAR_LENGTH(r.sample_ident) >= CHAR_LENGTH(g.spaced)
  -- The stored id really does open with this group: same length, same
  -- segments, and a separator wherever the group has one. Only the separators
  -- may differ, which is the whole of what this migration changes.
  AND REPLACE(LEFT(r.sample_ident, CHAR_LENGTH(g.spaced)), '/', ' ') = g.spaced
  -- And the group ends where the group should end.
  AND (
    CHAR_LENGTH(r.sample_ident) = CHAR_LENGTH(g.spaced)
    OR SUBSTRING(r.sample_ident, CHAR_LENGTH(g.spaced) + 1, 1) IN ('/', ' ')
  );

DROP TEMPORARY TABLE _ident_group;
