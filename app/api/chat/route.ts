import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { SessionNotFoundError, describeError } from '@/lib/app-error.util';
import { requireCurator } from '@/server/auth.service';
import { db } from '@/server/db.service';
import { respondError } from '@/server/http-response.util';
import { converseWithIndicador } from '@/server/indicator/orchestrator.service';

import type { IndicadorEvent } from '@/server/indicator/orchestrator.service';

const ConverseSchema = z.object({
  sessionId: z.uuid(),
  message: z.string().trim().min(1).max(8000),
});

/**
 * One conversation turn, streamed as SSE.
 *
 * Streaming is not decoration here: the Indicador consults the archive before
 * answering, and without text arriving progressively the curator stares at a
 * frozen screen for tens of seconds with no sign anything is happening.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const curator = await requireCurator();
    const { sessionId, message } = ConverseSchema.parse(await request.json());

    await requireOwnSession(sessionId, curator);

    return stream(converseWithIndicador(sessionId, message, request.signal));
  } catch (e) {
    return respondError(e);
  }
}

/** One curator neither reads nor writes in the other's session. */
async function requireOwnSession(sessionId: string, curator: string): Promise<void> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { curator: true },
  });

  if (session === null) {
    throw new SessionNotFoundError(sessionId);
  }

  if (session.curator !== curator) {
    // Same answer as "does not exist": does not reveal which of the two it was.
    throw new SessionNotFoundError(sessionId);
  }
}

function stream(events: AsyncGenerator<IndicadorEvent>): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch (e) {
        console.error(`Chat stream interrupted: ${describeError(e)}`);

        const failure: IndicadorEvent = {
          kind: 'error',
          code: 'stream_interrupted',
          message: 'A conversa foi interrompida. Recarregue a página.',
        };

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(failure)}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      // Proxy buffering breaks SSE; this header turns nginx's off.
      'x-accel-buffering': 'no',
    },
  });
}
