/**
 * The quality gate lives in `lib`, not `server`, and deliberately does not
 * import `server-only`.
 *
 * It is pure domain logic: no database, no environment, no secrets. Keeping it
 * shared lets the correction panel reuse `MIN_REASON_LENGTH` rather than
 * duplicate it, and lets the rules be unit-tested without a server runtime.
 * The Prisma import below is types only, so nothing from the ORM reaches the
 * browser bundle.
 */
import { AmbiguousFeedbackError } from './app-error.util';

import type { Confidence, Consensus, Curator, Quality } from '@prisma/client';

/**
 * A reason shorter than this does not carry a curatorial decision.
 *
 * Exported so the correction panel can enforce the same floor in the browser
 * instead of keeping its own copy of the number. The gate here remains the
 * authority — the form field is a convenience, not the rule.
 */
export const MIN_REASON_LENGTH = 15;

/**
 * Answers that look like a reason but are not. The list is deliberately short:
 * the goal is to catch the reflex ("não gostei"), not to grade the prose.
 *
 * The entries are Portuguese because that is what the curators type.
 */
const EMPTY_REASONS: ReadonlySet<string> = new Set([
  'nao',
  'sim',
  'ruim',
  'bom',
  'errado',
  'certo',
  'melhor',
  'pior',
  'trocar',
  'nao gostei',
  'nao curti',
  'sei la',
  'acho que nao',
  'nao serve',
  'nao combina',
]);

export type CuratorReview = {
  readonly curator: 'SONIA' | 'MIRELLA';
  readonly hasCorrection: boolean;
  readonly correction?: string;
  readonly reason?: string;
};

export type GateDecision = {
  readonly reviewedBy: Curator;
  readonly consensus: Consensus;
  readonly quality: Quality;
  readonly confidence: Confidence | null;
  readonly correction: string | null;
  readonly correctionReason: string | null;
  readonly disagreementNote: string | null;
};

/**
 * The quality gate: decides what a review becomes in the dataset.
 *
 *  - both curators agree      → ABSORB, HIGH confidence
 *  - only one reviewed        → ABSORB, NORMAL confidence
 *  - the two disagree         → REVIEW, both readings recorded, no winner
 *  - thin or ambiguous input  → nothing is written; it asks for clarification
 *
 * A disagreement is never discarded and never resolved in favour of one side.
 * The plurality of readings between Sonia and Mirella is an asset of the
 * dataset, not a defect.
 *
 * @param bothAgree Explicit declaration, needed only when both curators
 *   corrected: agreement cannot be inferred by comparing free text, and
 *   inferring it wrongly would either silence a real disagreement or invent one.
 * @throws {AmbiguousFeedbackError} when the reason is missing, or when both
 *   corrected without saying whether they reached the same reading.
 */
export function applyQualityGate(
  reviews: readonly CuratorReview[],
  bothAgree?: boolean,
): GateDecision {
  if (reviews.length === 0) {
    throw new AmbiguousFeedbackError('Nenhuma curadora avaliou esta recomendação ainda.');
  }

  if (reviews.length > 2) {
    throw new AmbiguousFeedbackError(
      'Só Sonia e Mirella avaliam. Envie no máximo uma avaliação de cada.',
    );
  }

  for (const review of reviews) {
    requireReason(review);
  }

  const [first, second] = reviews;

  if (first === undefined) {
    throw new AmbiguousFeedbackError('Nenhuma curadora avaliou esta recomendação ainda.');
  }

  if (second === undefined) {
    return decideWithOneReview(first);
  }

  if (first.curator === second.curator) {
    throw new AmbiguousFeedbackError(
      `Chegaram duas avaliações de ${first.curator}. Cada curadora avalia uma vez.`,
    );
  }

  return decideWithTwoReviews(first, second, bothAgree);
}

function decideWithOneReview(review: CuratorReview): GateDecision {
  return {
    reviewedBy: review.curator,
    consensus: 'ONLY_ONE_REVIEWED',
    quality: 'ABSORB',
    confidence: 'NORMAL',
    correction: review.hasCorrection ? (review.correction ?? null) : null,
    correctionReason: review.hasCorrection ? (review.reason ?? null) : null,
    disagreementNote: null,
  };
}

function decideWithTwoReviews(
  first: CuratorReview,
  second: CuratorReview,
  bothAgree?: boolean,
): GateDecision {
  const neitherCorrected = !first.hasCorrection && !second.hasCorrection;

  if (neitherCorrected) {
    return {
      reviewedBy: 'BOTH',
      consensus: 'AGREEMENT',
      quality: 'ABSORB',
      confidence: 'HIGH',
      correction: null,
      correctionReason: null,
      disagreementNote: null,
    };
  }

  const onlyOneCorrected = first.hasCorrection !== second.hasCorrection;

  if (onlyOneCorrected) {
    // One found the recommendation good, the other did not: that is a
    // disagreement, even if nobody used the word.
    return recordDisagreement(first, second);
  }

  if (bothAgree === undefined) {
    throw new AmbiguousFeedbackError(
      'Sonia e Mirella corrigiram as duas. É a mesma leitura ou são leituras ' +
        'diferentes? Responda antes de gravar — não dá para adivinhar sem arriscar ' +
        'silenciar uma divergência.',
    );
  }

  if (!bothAgree) {
    return recordDisagreement(first, second);
  }

  return {
    reviewedBy: 'BOTH',
    consensus: 'AGREEMENT',
    quality: 'ABSORB',
    confidence: 'HIGH',
    correction: first.correction ?? second.correction ?? null,
    correctionReason: joinReasons(first, second),
    disagreementNote: null,
  };
}

/**
 * Records both readings side by side, with attribution, and elects no winner:
 * `correction` stays null on purpose (the database CHECK confirms it).
 */
function recordDisagreement(first: CuratorReview, second: CuratorReview): GateDecision {
  return {
    reviewedBy: 'BOTH',
    consensus: 'DISAGREEMENT',
    quality: 'REVIEW',
    confidence: null,
    correction: null,
    correctionReason: null,
    disagreementNote: [describeReading(first), describeReading(second)].join('\n\n'),
  };
}

function describeReading(review: CuratorReview): string {
  if (!review.hasCorrection) {
    return `${review.curator}: manteve a indicação como estava.`;
  }

  const correction = review.correction ?? '(correção não detalhada)';
  const reason = review.reason ?? '(porquê não detalhado)';

  return `${review.curator}: ${correction}\nPorquê: ${reason}`;
}

function joinReasons(first: CuratorReview, second: CuratorReview): string | null {
  const reasons = [first, second]
    .filter((review) => review.hasCorrection)
    .map((review) => `${review.curator}: ${review.reason ?? ''}`.trim());

  return reasons.length > 0 ? reasons.join('\n') : null;
}

/**
 * A correction without a reason is nearly useless data — so it becomes no data
 * at all until the reason arrives.
 */
function requireReason(review: CuratorReview): void {
  if (!review.hasCorrection) {
    return;
  }

  const correction = review.correction?.trim() ?? '';

  if (correction.length === 0) {
    throw new AmbiguousFeedbackError(
      `${review.curator} marcou que há correção mas não disse qual. ` +
        'Qual seria a indicação no lugar?',
    );
  }

  const reason = review.reason?.trim() ?? '';

  if (reason.length === 0) {
    throw new AmbiguousFeedbackError(
      `Falta o porquê da correção de ${review.curator}. ` +
        'O que nesta indicação não servia para esta pessoa, neste momento?',
    );
  }

  if (reason.length < MIN_REASON_LENGTH || isEmptyReason(reason)) {
    throw new AmbiguousFeedbackError(
      `O porquê de ${review.curator} ("${reason}") não diz o que mudou de leitura. ` +
        'Um pouco mais: o que a pessoa precisava e esta indicação não dava?',
    );
  }
}

function isEmptyReason(reason: string): boolean {
  const normalized = reason
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/gu, '')
    .trim();

  return EMPTY_REASONS.has(normalized);
}
