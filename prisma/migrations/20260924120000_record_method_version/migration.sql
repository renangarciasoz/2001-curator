-- Which Method produced each conversation.
--
-- The exporter used to stamp every line with the *current* METHOD_VERSION, read
-- from the constant at export time. That is correct exactly until the Method
-- changes for the first time — after which every conversation ever recorded is
-- relabelled as having been produced by a prompt it never saw.
--
-- Phase 2 trains on this file. A row that misreports which instructions the
-- Indicador was following when a curator corrected it is worse than a missing
-- row: it teaches the wrong lesson with full confidence.
--
-- The default exists only to carry the rows already in the table. Everything
-- recorded before this migration was recorded under Method 1, which is a fact
-- about history, not a fallback. The default is dropped immediately afterwards
-- so that every future insert has to say which Method it ran under, and code
-- that forgets fails loudly instead of quietly claiming version 1.

ALTER TABLE "conversation"
  ADD COLUMN "method_version" integer NOT NULL DEFAULT 1;

ALTER TABLE "conversation"
  ALTER COLUMN "method_version" DROP DEFAULT;

-- There is no Method 0.
ALTER TABLE "conversation"
  ADD CONSTRAINT "conversation_method_version_positive"
  CHECK ("method_version" >= 1);
