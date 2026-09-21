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
    <section className="mt-12">
      <h2 className="label-caps mb-3">Suas conversas</h2>

      <ol className="space-y-px border border-rule bg-rule">
        {sessions.map((session) => (
          <li key={session.sessionId}>
            <Link
              href={`/chat/${session.sessionId}`}
              className="block bg-paper-raised px-4 py-4 transition-colors hover:bg-paper-sunk"
            >
              <p className="text-[16px] leading-[1.5] text-pretty">{session.opening}</p>
              <p className="label-caps mt-2">
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
