-- CreateEnum
CREATE TYPE "Curator" AS ENUM ('SONIA', 'MIRELLA', 'BOTH', 'DEMO');

-- CreateEnum
CREATE TYPE "CommercialRegister" AS ENUM ('COMMERCIAL', 'ARTHOUSE', 'BOTH');

-- CreateEnum
CREATE TYPE "ArchiveCategory" AS ENUM ('COMPANY_HISTORY', 'TRAINING_METHOD', 'CURATION', 'CLIPPING', 'INTERVIEWS', 'MAGAZINES_2001', 'COURSES', 'OMO_LIST', 'SERVICE_AND_REAL_CASES', 'SONIA_TEXTS', 'AWARDS', 'MARKETING_AND_EVENTS');

-- CreateEnum
CREATE TYPE "ConnectionType" AS ENUM ('ENTRY_POINT', 'IF_YOU_LIKED', 'BEFORE_WATCHING', 'RELEASE_TO_ARCHIVE', 'ARCHIVE_TO_RELEASE', 'OTHER');

-- CreateEnum
CREATE TYPE "EditorialListType" AS ENUM ('MONTHLY_TOP', 'THEMATIC', 'EVENT', 'HISTORIC_OMO');

-- CreateEnum
CREATE TYPE "Consensus" AS ENUM ('AGREEMENT', 'DISAGREEMENT', 'ONLY_ONE_REVIEWED');

-- CreateEnum
CREATE TYPE "Quality" AS ENUM ('ABSORB', 'DISCARD', 'REVIEW');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('HIGH', 'NORMAL');

-- CreateEnum
CREATE TYPE "FactualSource" AS ENUM ('TMDB', 'DEV_FIXTURE');

-- CreateEnum
CREATE TYPE "CuratorialSource" AS ENUM ('CURATION_2001', 'DEMO');

-- CreateEnum
CREATE TYPE "ConversationRole" AS ENUM ('RECOMMENDED_BY_AI', 'CORRECTED_BY_CURATOR');

-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('CURATOR', 'INDICADOR');

-- CreateTable
CREATE TABLE "film" (
    "id" UUID NOT NULL,
    "tmdb_id" INTEGER,
    "title" TEXT NOT NULL,
    "original_title" TEXT,
    "year" INTEGER,
    "director" TEXT,
    "country" TEXT,
    "factual_synopsis" TEXT,
    "poster_path" TEXT,
    "emotional_tone" TEXT,
    "what_it_provokes" TEXT,
    "commercial_register" "CommercialRegister",
    "curatorial_notes" TEXT,
    "historical_context" TEXT,
    "archive_category" "ArchiveCategory",
    "reviewed_by" "Curator"[],
    "factual_source" "FactualSource" NOT NULL,
    "curatorial_source" "CuratorialSource",
    "indexed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "film_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection" (
    "id" UUID NOT NULL,
    "source_film_id" UUID NOT NULL,
    "target_film_id" UUID NOT NULL,
    "type" "ConnectionType" NOT NULL,
    "bridged_by" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "curator" "Curator" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journey" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "curator" "Curator" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journey_film" (
    "journey_id" UUID NOT NULL,
    "film_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "why_note" TEXT NOT NULL,

    CONSTRAINT "journey_film_pkey" PRIMARY KEY ("journey_id","film_id")
);

-- CreateTable
CREATE TABLE "editorial_list" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "type" "EditorialListType" NOT NULL,
    "curator" "Curator" NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "editorial_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editorial_list_film" (
    "list_id" UUID NOT NULL,
    "film_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "curation_line" TEXT NOT NULL,

    CONSTRAINT "editorial_list_film_pkey" PRIMARY KEY ("list_id","film_id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "profile_id" UUID,
    "curator" "Curator" NOT NULL,
    "title" TEXT,
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "author" "MessageAuthor" NOT NULL,
    "blocks" JSONB NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation" (
    "id" UUID NOT NULL,
    "session_id" UUID,
    "profile_id" UUID,
    "user_request" TEXT NOT NULL,
    "ai_questions" JSONB NOT NULL,
    "ai_recommendation" TEXT NOT NULL,
    "correction" TEXT,
    "correction_reason" TEXT,
    "reviewed_by" "Curator",
    "disagreement_note" TEXT,
    "consensus" "Consensus",
    "quality" "Quality",
    "confidence" "Confidence",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_film" (
    "conversation_id" UUID NOT NULL,
    "film_id" UUID NOT NULL,
    "role" "ConversationRole" NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "conversation_film_pkey" PRIMARY KEY ("conversation_id","film_id","role")
);

-- CreateTable
CREATE TABLE "profile" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "likes" TEXT[],
    "avoids" TEXT[],
    "repertoire" TEXT,
    "life_moment" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'padrao',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_watched_film" (
    "profile_id" UUID NOT NULL,
    "film_id" UUID NOT NULL,
    "note" TEXT,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_watched_film_pkey" PRIMARY KEY ("profile_id","film_id")
);

-- CreateTable
CREATE TABLE "profile_journey" (
    "profile_id" UUID NOT NULL,
    "journey_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "profile_journey_pkey" PRIMARY KEY ("profile_id","journey_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "film_tmdb_id_key" ON "film"("tmdb_id");

-- CreateIndex
CREATE INDEX "film_archive_category_idx" ON "film"("archive_category");

-- CreateIndex
CREATE INDEX "film_indexed_at_idx" ON "film"("indexed_at");

-- CreateIndex
CREATE INDEX "connection_source_film_id_idx" ON "connection"("source_film_id");

-- CreateIndex
CREATE UNIQUE INDEX "connection_source_film_id_target_film_id_type_key" ON "connection"("source_film_id", "target_film_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "journey_film_journey_id_position_key" ON "journey_film"("journey_id", "position");

-- CreateIndex
CREATE INDEX "editorial_list_period_idx" ON "editorial_list"("period");

-- CreateIndex
CREATE UNIQUE INDEX "editorial_list_film_list_id_position_key" ON "editorial_list_film"("list_id", "position");

-- CreateIndex
CREATE INDEX "session_curator_idx" ON "session"("curator");

-- CreateIndex
CREATE UNIQUE INDEX "message_session_id_position_key" ON "message"("session_id", "position");

-- CreateIndex
CREATE INDEX "conversation_quality_idx" ON "conversation"("quality");

-- CreateIndex
CREATE INDEX "conversation_consensus_idx" ON "conversation"("consensus");

-- CreateIndex
CREATE UNIQUE INDEX "profile_user_id_key" ON "profile"("user_id");

-- AddForeignKey
ALTER TABLE "connection" ADD CONSTRAINT "connection_source_film_id_fkey" FOREIGN KEY ("source_film_id") REFERENCES "film"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection" ADD CONSTRAINT "connection_target_film_id_fkey" FOREIGN KEY ("target_film_id") REFERENCES "film"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_film" ADD CONSTRAINT "journey_film_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_film" ADD CONSTRAINT "journey_film_film_id_fkey" FOREIGN KEY ("film_id") REFERENCES "film"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_list_film" ADD CONSTRAINT "editorial_list_film_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "editorial_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_list_film" ADD CONSTRAINT "editorial_list_film_film_id_fkey" FOREIGN KEY ("film_id") REFERENCES "film"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_film" ADD CONSTRAINT "conversation_film_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_film" ADD CONSTRAINT "conversation_film_film_id_fkey" FOREIGN KEY ("film_id") REFERENCES "film"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_watched_film" ADD CONSTRAINT "profile_watched_film_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_watched_film" ADD CONSTRAINT "profile_watched_film_film_id_fkey" FOREIGN KEY ("film_id") REFERENCES "film"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_journey" ADD CONSTRAINT "profile_journey_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_journey" ADD CONSTRAINT "profile_journey_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
