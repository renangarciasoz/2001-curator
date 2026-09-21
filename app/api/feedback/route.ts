import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireCurator } from '@/server/auth.service';
import { respondError } from '@/server/http-response.util';
import {
  DiscardNewSchema,
  RecordFeedbackInputSchema,
  discardFeedback,
  recordFeedback,
  recordNewDiscard,
} from '@/server/tools/record-feedback.service';

const DiscardSchema = z.union([
  z.object({
    conversationId: z.uuid(),
    reason: z.string().trim().min(1).max(2000),
  }),
  DiscardNewSchema,
]);

/**
 * Records the review of a recommendation.
 *
 * This is the direct path from the correction interface — it does not go
 * through the model. The reason the curator writes arrives here exactly as she
 * wrote it, and the quality gate decides what to do with it. A 422 means
 * nothing was written and the interface must ask the question in the body.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireCurator();

    const input = RecordFeedbackInputSchema.parse(await request.json());

    return NextResponse.json(await recordFeedback(input), { status: 201 });
  } catch (e) {
    return respondError(e);
  }
}

/**
 * Marks a review as discarded when the curator would not clarify.
 *
 * Recording the discard is deliberate: deleting would make Phase 2 believe the
 * recommendation was never reviewed.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    await requireCurator();

    const body = DiscardSchema.parse(await request.json());

    if ('conversationId' in body) {
      await discardFeedback(body.conversationId, body.reason);

      return NextResponse.json({ conversationId: body.conversationId, quality: 'DISCARD' });
    }

    const conversationId = await recordNewDiscard(body);

    return NextResponse.json({ conversationId, quality: 'DISCARD' }, { status: 201 });
  } catch (e) {
    return respondError(e);
  }
}
