-- The Method's invariants, in the database.
--
-- These CHECK constraints are not expressible in schema.prisma — Prisma does not
-- model CHECK — which is why they live in their own migration. They exist because
-- the two rules that matter most to the value of the dataset cannot depend on the
-- application layer alone: a correction without a reason, or a silenced
-- disagreement, corrupts the Phase 2 training data irreversibly.
--
-- `prisma migrate diff` does not see CHECK constraints, so they never show up as
-- drift. Proving they exist is the job of a test, not of the diff.

-- The reason for a bridge is mandatory and cannot be whitespace.
ALTER TABLE "connection"
  ADD CONSTRAINT "connection_why_not_empty"
  CHECK (btrim("why") <> '');

ALTER TABLE "connection"
  ADD CONSTRAINT "connection_bridged_by_not_empty"
  CHECK (btrim("bridged_by") <> '');

-- A bridge links two different films.
ALTER TABLE "connection"
  ADD CONSTRAINT "connection_source_differs_from_target"
  CHECK ("source_film_id" <> "target_film_id");

-- Every position in a journey carries the reason for being there.
ALTER TABLE "journey_film"
  ADD CONSTRAINT "journey_film_why_note_not_empty"
  CHECK (btrim("why_note") <> '');

-- Every editorial list entry carries its line of curation.
ALTER TABLE "editorial_list_film"
  ADD CONSTRAINT "editorial_list_film_curation_line_not_empty"
  CHECK (btrim("curation_line") <> '');

-- A correction without a reason is nearly useless data: the schema refuses it.
ALTER TABLE "conversation"
  ADD CONSTRAINT "conversation_correction_requires_reason"
  CHECK (
    "correction" IS NULL
    OR ("correction_reason" IS NOT NULL AND btrim("correction_reason") <> '')
  );

-- A disagreement between the two curators is never silenced, and never elects a
-- winner: both readings stay on record and `correction` remains null.
ALTER TABLE "conversation"
  ADD CONSTRAINT "conversation_disagreement_records_both_readings"
  CHECK (
    "consensus" IS DISTINCT FROM 'DISAGREEMENT'
    OR (
      "disagreement_note" IS NOT NULL
      AND btrim("disagreement_note") <> ''
      AND "correction" IS NULL
    )
  );

-- A disagreement never becomes training data without human review.
ALTER TABLE "conversation"
  ADD CONSTRAINT "conversation_disagreement_is_always_review"
  CHECK (
    "consensus" IS DISTINCT FROM 'DISAGREEMENT'
    OR "quality" = 'REVIEW'
  );

-- Every absorbed piece of feedback declares its confidence level.
ALTER TABLE "conversation"
  ADD CONSTRAINT "conversation_absorb_requires_confidence"
  CHECK (
    "quality" IS DISTINCT FROM 'ABSORB'
    OR "confidence" IS NOT NULL
  );

-- Curation traceability: the 2001 curatorial layer always says who reviewed it,
-- and DEMO (demonstration data) never disguises itself as real curation.
ALTER TABLE "film"
  ADD CONSTRAINT "film_real_curation_declares_reviewer"
  CHECK (
    "curatorial_source" IS DISTINCT FROM 'CURATION_2001'
    OR (
      array_length("reviewed_by", 1) IS NOT NULL
      AND NOT ('DEMO' = ANY ("reviewed_by"))
    )
  );

ALTER TABLE "film"
  ADD CONSTRAINT "film_demo_does_not_pose_as_curation"
  CHECK (
    "curatorial_source" IS DISTINCT FROM 'DEMO'
    OR NOT (
      'SONIA' = ANY ("reviewed_by")
      OR 'MIRELLA' = ANY ("reviewed_by")
      OR 'BOTH' = ANY ("reviewed_by")
    )
  );
