import 'server-only';

import { NextResponse } from 'next/server';

import { requireCurator } from '@/server/auth.service';
import { respondError } from '@/server/http-response.util';
import { deleteSession } from '@/server/session.service';

/**
 * Throws away a conversation.
 *
 * Reviews recorded in it stay in the dataset — see `deleteSession`. The count
 * comes back so the interface can say so instead of implying the reasons went
 * with the chat.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  try {
    const curator = await requireCurator();
    const { sessionId } = await params;

    const { reviewsKept } = await deleteSession(sessionId, curator);

    return NextResponse.json({ sessionId, reviewsKept }, { status: 200 });
  } catch (e) {
    return respondError(e);
  }
}
