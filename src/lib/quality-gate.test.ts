import { describe, expect, it } from 'vitest';

import { AmbiguousFeedbackError } from './app-error.util';

import { applyQualityGate } from './quality-gate.util';

import type { CuratorReview } from './quality-gate.util';

// Reasons are Portuguese on purpose: that is what the curators type, and the
// gate's "empty reason" detection works on Portuguese reflex answers.
const GOOD_REASON = 'Ela pediu conforto e a indicação exigia disposição para ser desestabilizada.';
const OTHER_GOOD_REASON =
  'O filme é certo, mas cedo demais no repertório dela — precisa de uma ponte antes.';

function review(curator: 'SONIA' | 'MIRELLA', extra: Partial<CuratorReview> = {}): CuratorReview {
  return { curator, hasCorrection: false, ...extra };
}

describe('quality gate', () => {
  describe('a single curator', () => {
    it('absorbs with normal confidence when there was no correction', () => {
      const decision = applyQualityGate([review('SONIA')]);

      expect(decision).toMatchObject({
        reviewedBy: 'SONIA',
        consensus: 'ONLY_ONE_REVIEWED',
        quality: 'ABSORB',
        confidence: 'NORMAL',
        correction: null,
        disagreementNote: null,
      });
    });

    it('absorbs the correction together with its reason', () => {
      const decision = applyQualityGate([
        review('MIRELLA', {
          hasCorrection: true,
          correction: 'Central do Brasil',
          reason: GOOD_REASON,
        }),
      ]);

      expect(decision).toMatchObject({
        reviewedBy: 'MIRELLA',
        quality: 'ABSORB',
        correction: 'Central do Brasil',
        correctionReason: GOOD_REASON,
      });
    });
  });

  describe('the reason is mandatory', () => {
    it('refuses a correction with no reason', () => {
      expect(() =>
        applyQualityGate([review('SONIA', { hasCorrection: true, correction: 'Rashomon' })]),
      ).toThrow(AmbiguousFeedbackError);
    });

    it('refuses a correction that does not say what the correction is', () => {
      expect(() =>
        applyQualityGate([review('SONIA', { hasCorrection: true, reason: GOOD_REASON })]),
      ).toThrow(AmbiguousFeedbackError);
    });

    it('refuses a reflex reason', () => {
      expect(() =>
        applyQualityGate([
          review('SONIA', {
            hasCorrection: true,
            correction: 'Rashomon',
            reason: 'não gostei',
          }),
        ]),
      ).toThrow(AmbiguousFeedbackError);
    });

    it('hands back a question for the curator, not just an error', () => {
      try {
        applyQualityGate([review('SONIA', { hasCorrection: true, correction: 'Rashomon' })]);
        expect.unreachable('the gate should have refused');
      } catch (e) {
        expect(e).toBeInstanceOf(AmbiguousFeedbackError);

        if (e instanceof AmbiguousFeedbackError) {
          expect(e.clarificationRequest).toContain('porquê');
        }
      }
    });
  });

  describe('both curators', () => {
    it('absorbs with high confidence when neither corrected', () => {
      const decision = applyQualityGate([review('SONIA'), review('MIRELLA')]);

      expect(decision).toMatchObject({
        reviewedBy: 'BOTH',
        consensus: 'AGREEMENT',
        quality: 'ABSORB',
        confidence: 'HIGH',
      });
    });

    it('treats "one corrected, the other did not" as a disagreement', () => {
      const decision = applyQualityGate([
        review('SONIA'),
        review('MIRELLA', {
          hasCorrection: true,
          correction: 'Central do Brasil',
          reason: GOOD_REASON,
        }),
      ]);

      expect(decision).toMatchObject({
        consensus: 'DISAGREEMENT',
        quality: 'REVIEW',
        confidence: null,
        correction: null,
      });
      expect(decision.disagreementNote).toContain('SONIA');
      expect(decision.disagreementNote).toContain('MIRELLA');
    });

    it('asks instead of guessing when both corrected', () => {
      expect(() =>
        applyQualityGate([
          review('SONIA', { hasCorrection: true, correction: 'A', reason: GOOD_REASON }),
          review('MIRELLA', { hasCorrection: true, correction: 'B', reason: OTHER_GOOD_REASON }),
        ]),
      ).toThrow(AmbiguousFeedbackError);
    });

    it('records both readings when they declare they disagree', () => {
      const decision = applyQualityGate(
        [
          review('SONIA', { hasCorrection: true, correction: 'A', reason: GOOD_REASON }),
          review('MIRELLA', { hasCorrection: true, correction: 'B', reason: OTHER_GOOD_REASON }),
        ],
        false,
      );

      expect(decision).toMatchObject({
        consensus: 'DISAGREEMENT',
        quality: 'REVIEW',
        correction: null,
        correctionReason: null,
      });
      expect(decision.disagreementNote).toContain(GOOD_REASON);
      expect(decision.disagreementNote).toContain(OTHER_GOOD_REASON);
    });

    it('absorbs with high confidence when they declare the same reading', () => {
      const decision = applyQualityGate(
        [
          review('SONIA', { hasCorrection: true, correction: 'A', reason: GOOD_REASON }),
          review('MIRELLA', { hasCorrection: true, correction: 'A', reason: OTHER_GOOD_REASON }),
        ],
        true,
      );

      expect(decision).toMatchObject({
        consensus: 'AGREEMENT',
        quality: 'ABSORB',
        confidence: 'HIGH',
        correction: 'A',
      });
      expect(decision.correctionReason).toContain(GOOD_REASON);
      expect(decision.correctionReason).toContain(OTHER_GOOD_REASON);
    });
  });

  describe('invalid input', () => {
    it('refuses no reviews at all', () => {
      expect(() => applyQualityGate([])).toThrow(AmbiguousFeedbackError);
    });

    it('refuses two reviews from the same curator', () => {
      expect(() => applyQualityGate([review('SONIA'), review('SONIA')])).toThrow(
        AmbiguousFeedbackError,
      );
    });
  });
});
