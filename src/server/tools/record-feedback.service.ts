import 'server-only';

import { z } from 'zod';

import { ConversationNotFoundError } from '@/lib/app-error.util';
import { applyQualityGate } from '@/lib/quality-gate.util';
import { METHOD_VERSION } from '@/method/system-prompt.constant';

import { db } from '../db.service';

import type { CuratorReview, GateDecision } from '@/lib/quality-gate.util';
import type { Prisma } from '@prisma/client';

/** The Method allows at most three options at a time. The schema refuses a fourth. */
const MAX_OPTIONS = 3;

export const RecordFeedbackInputSchema = z.object({
  conversation_id: z
    .uuid()
    .optional()
    .describe('An already-open conversation; omit to create a new one.'),
  session_id: z.uuid().optional(),
  profile_id: z.uuid().optional(),

  user_request: z.string().min(1).describe('What the person wanted, in their own words.'),
  ai_questions: z
    .array(z.string())
    .default([])
    .describe('What the Indicador asked before recommending.'),
  ai_recommendation: z
    .string()
    .min(1)
    .describe('What the Indicador suggested, with the reasoning for each option.'),

  reviews: z
    .array(
      z.object({
        curator: z.enum(['SONIA', 'MIRELLA']),
        has_correction: z.boolean(),
        correction: z.string().optional().describe('The recommendation that replaces it.'),
        reason: z.string().optional().describe('Required when there is a correction.'),
      }),
    )
    .min(1)
    .max(2),
  both_agree: z
    .boolean()
    .optional()
    .describe('Only when both corrected: are the readings the same?'),

  recommended_films: z.array(z.uuid()).max(MAX_OPTIONS).default([]),
  corrected_films: z.array(z.uuid()).max(MAX_OPTIONS).default([]),
});

export type RecordFeedbackInput = z.infer<typeof RecordFeedbackInputSchema>;

export type FeedbackResult = {
  conversation_id: string;
  reviewed_by: string;
  consensus: string;
  quality: string;
  confidence: string | null;
  /** A sentence, in Portuguese, ready for the Indicador to relay to the curator. */
  summary: string;
};

/**
 * Records the review of a recommendation after it passes the quality gate.
 *
 * Nothing is written if the gate asks for clarification: the tool raises
 * `AmbiguousFeedbackError` and the caller must ask, not discard silently.
 *
 * @throws {AmbiguousFeedbackError} feedback insufficient to become data.
 * @throws {ConversationNotFoundError} the given `conversation_id` does not exist.
 */
export async function recordFeedback(input: RecordFeedbackInput): Promise<FeedbackResult> {
  const decision = applyQualityGate(input.reviews.map(toCuratorReview), input.both_agree);

  const conversationId = await persist(input, decision);

  return {
    conversation_id: conversationId,
    reviewed_by: decision.reviewedBy,
    consensus: decision.consensus,
    quality: decision.quality,
    confidence: decision.confidence,
    summary: summarize(decision),
  };
}

export const DiscardNewSchema = z.object({
  session_id: z.uuid().optional(),
  user_request: z.string().min(1),
  ai_questions: z.array(z.string()).default([]),
  ai_recommendation: z.string().min(1),
  reviewed_by: z.enum(['SONIA', 'MIRELLA']),
  reason: z.string().trim().min(1).max(2000),
});

export type DiscardNewInput = z.infer<typeof DiscardNewSchema>;

/**
 * Records a review that did not become data because the curator would not
 * elaborate on the reason.
 *
 * The gate refused, so there is no row yet — and writing nothing at all would
 * make Phase 2 conclude that the recommendation was never reviewed. Recording
 * the discard preserves the difference between "not reviewed" and "reviewed
 * and rejected".
 */
export async function recordNewDiscard(input: DiscardNewInput): Promise<string> {
  const conversation = await db.conversation.create({
    data: {
      ...(input.session_id !== undefined ? { sessionId: input.session_id } : {}),
      methodVersion: METHOD_VERSION,
      userRequest: input.user_request,
      aiQuestions: input.ai_questions,
      aiRecommendation: input.ai_recommendation,
      reviewedBy: input.reviewed_by,
      disagreementNote: `Descartado sem esclarecimento. Motivo registrado: ${input.reason}`,
      quality: 'DISCARD',
    },
    select: { id: true },
  });

  return conversation.id;
}

/**
 * Marks an existing conversation as discarded.
 *
 * @throws {ConversationNotFoundError} when the conversation does not exist.
 */
export async function discardFeedback(conversationId: string, reason: string): Promise<void> {
  const exists = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true },
  });

  if (exists === null) {
    throw new ConversationNotFoundError(conversationId);
  }

  await db.conversation.update({
    where: { id: conversationId },
    data: {
      quality: 'DISCARD',
      confidence: null,
      correction: null,
      correctionReason: null,
      disagreementNote: `Descartado sem esclarecimento. Motivo registrado: ${reason}`,
    },
  });
}

function toCuratorReview(review: RecordFeedbackInput['reviews'][number]): CuratorReview {
  return {
    curator: review.curator,
    hasCorrection: review.has_correction,
    ...(review.correction !== undefined ? { correction: review.correction } : {}),
    ...(review.reason !== undefined ? { reason: review.reason } : {}),
  };
}

async function persist(input: RecordFeedbackInput, decision: GateDecision): Promise<string> {
  const data = {
    // Stamped here, where the conversation happened — not at export time, which
    // would relabel history every time the Method text changes.
    methodVersion: METHOD_VERSION,
    userRequest: input.user_request,
    aiQuestions: input.ai_questions,
    aiRecommendation: input.ai_recommendation,
    correction: decision.correction,
    correctionReason: decision.correctionReason,
    reviewedBy: decision.reviewedBy,
    disagreementNote: decision.disagreementNote,
    consensus: decision.consensus,
    quality: decision.quality,
    confidence: decision.confidence,
  };

  return db.$transaction(async (tx) => {
    const conversationId = await writeConversation(tx, input, data);

    await tx.conversationFilm.deleteMany({ where: { conversationId } });

    const links = [
      ...input.recommended_films.map((filmId, position) => ({
        conversationId,
        filmId,
        role: 'RECOMMENDED_BY_AI' as const,
        position,
      })),
      ...input.corrected_films.map((filmId, position) => ({
        conversationId,
        filmId,
        role: 'CORRECTED_BY_CURATOR' as const,
        position,
      })),
    ];

    if (links.length > 0) {
      await tx.conversationFilm.createMany({ data: links, skipDuplicates: true });
    }

    return conversationId;
  });
}

async function writeConversation(
  tx: Prisma.TransactionClient,
  input: RecordFeedbackInput,
  data: Prisma.ConversationUncheckedUpdateInput & Prisma.ConversationUncheckedCreateInput,
): Promise<string> {
  if (input.conversation_id === undefined) {
    const created = await tx.conversation.create({
      data: {
        ...data,
        ...(input.session_id !== undefined ? { sessionId: input.session_id } : {}),
        ...(input.profile_id !== undefined ? { profileId: input.profile_id } : {}),
      },
      select: { id: true },
    });

    return created.id;
  }

  const exists = await tx.conversation.findUnique({
    where: { id: input.conversation_id },
    select: { id: true },
  });

  if (exists === null) {
    throw new ConversationNotFoundError(input.conversation_id);
  }

  const updated = await tx.conversation.update({
    where: { id: input.conversation_id },
    data,
    select: { id: true },
  });

  return updated.id;
}

/** Portuguese: this sentence is relayed straight to the curator. */
function summarize(decision: GateDecision): string {
  switch (decision.consensus) {
    case 'AGREEMENT':
      return 'Sonia e Mirella chegaram à mesma leitura. Registrado como dado de treino com confiança alta.';
    case 'ONLY_ONE_REVIEWED':
      return `Avaliação de ${decision.reviewedBy} registrada com confiança normal. A segunda leitura ainda pode entrar.`;
    case 'DISAGREEMENT':
      return 'As duas leituras foram registradas lado a lado, sem eleger vencedora. Marcado para revisão — a divergência é o dado.';
    default: {
      const exhaustive: never = decision.consensus;
      throw new Error(`unhandled consensus: ${exhaustive as string}`);
    }
  }
}
