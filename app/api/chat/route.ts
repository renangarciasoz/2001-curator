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
 * A turn can make up to eight tool round-trips before it answers, each one a
 * full model call, so this runs far past a default serverless timeout.
 *
 * If a deploy rejects this value, the plan's ceiling is lower — lower it to
 * match rather than leaving it unset. And if turns genuinely need more than
 * the ceiling allows, the conversation loop belongs on a long-lived host, not
 * on a function; see README § Deploying.
 */
export const maxDuration = 300;

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

/**
 * How often to prove the connection is still alive.
 *
 * A turn can spend forty seconds on tool calls without emitting a single
 * token. To everything between here and the browser — proxies, load balancers,
 * the client's own timers — silence on a socket is indistinguishable from a
 * dead server. The browser's watchdog is set to several times this interval, so
 * a missed beat means something really is wrong.
 */
const HEARTBEAT_MS = 15_000;

function stream(events: AsyncGenerator<IndicadorEvent>): Response {
  const encoder = new TextEncoder();

  // Enqueueing into a closed or cancelled controller throws, and the heartbeat
  // fires on a timer that knows about neither. Declared out here because
  // `cancel` has to be able to clear it.
  let open = true;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown): void => {
        if (open) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        }
      };

      const heartbeat = setInterval(() => {
        send({ kind: 'ping' });
      }, HEARTBEAT_MS);

      try {
        for await (const event of events) {
          send(event);
        }
      } catch (e) {
        console.error(`Chat stream interrupted: ${describeError(e)}`);

        const failure: IndicadorEvent = {
          kind: 'error',
          code: 'stream_interrupted',
          message: 'A conversa foi interrompida. O que já foi dito está salvo.',
        };

        send(failure);
      } finally {
        clearInterval(heartbeat);

        if (open) {
          open = false;
          controller.close();
        }
      }
    },

    cancel() {
      // The browser went away — aborted, navigated, closed the tab. The
      // generator's own `signal` stops the model; this just stops us writing
      // into a stream nobody is reading.
      open = false;
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
