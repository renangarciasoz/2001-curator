import Link from 'next/link';

import type { SessionSummary } from '@/server/session.service';

/**
 * The way back into a conversation.
 *
 * Every message is persisted as it happens, so a session is never lost — but
 * without this list the only route back is its UUID, and closing the tab loses
 * it in practice.
 */
export function SessionList({ sessions }: { sessions: readonly SessionSummary[] }) {
  if (sessions.length === 0) {
    return null;
  }

  return (
    <section className="mt-14">
      <h2 className="label-caps mb-4">Suas conversas</h2>

      <ol className="space-y-px border border-seam bg-seam">
        {sessions.map((session) => (
          <li key={session.sessionId}>
            <Link
              href={`/chat/${session.sessionId}`}
              className="group block bg-panel px-4 py-4 transition-colors hover:bg-recess"
            >
              <p className="text-[15px] leading-[1.55] text-signal-dim transition-colors group-hover:text-signal text-pretty">
                {session.opening}
              </p>
              <p className="label-caps mt-2.5">
                {session.lastActivity.toISOString().slice(0, 10)}
                {' · '}
                {session.persona !== null ? session.persona : 'sem persona'}
                {' · '}
                {session.turns === 1 ? '1 mensagem' : `${String(session.turns)} mensagens`}
              </p>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
