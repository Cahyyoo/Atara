-- The Sample ID now uses one separator throughout: MOL/LIM/S2/PA4/B489/1.1/25
-- rather than MOL LIM S2/PA4/B489/1.1/25.
--
-- Leaving the stored rows alone would put two shapes in one column, and
-- searching "MOL/LIM" would silently miss every older sample.
--
-- REPLACE is exact here rather than a guess: a master code is validated against
-- ^[A-Za-z0-9-]+$, so no space can ever get inside one. The only space a Sample
-- ID has ever contained is the separator in its leading group.
--
-- Uniqueness survives: this is one-to-one over the existing rows, and every
-- stored id is in the old shape, so nothing can be mapped onto anything else.
UPDATE lab_records
SET sample_ident = REPLACE(sample_ident, ' ', '/')
WHERE sample_ident LIKE '% %';
