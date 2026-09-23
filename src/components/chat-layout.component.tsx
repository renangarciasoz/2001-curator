'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CuratorSwitch } from './curator-switch.component';

import type { SessionSummary } from '@/server/session.service';
import type { ReactNode } from 'react';

/**
 * The whole application, in one screen.
 *
 * There is no home page and no dashboard: the curators land inside a
 * conversation, because that is the only thing they came to do. Everything
 * else — switching who they are, past conversations, the dataset — sits in the
 * header or the rail beside it.
 *
 * The rail is a permanent column from `md` up and a drawer below it. Phones are
 * the common case here, so the drawer is the default and the column is the
 * enhancement, not the other way around.
 */
export function ChatLayout({
  curator,
  sessions,
  activeSessionId,
  children,
}: {
  curator: string;
  sessions: readonly SessionSummary[];
  activeSessionId: string | null;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-seam bg-space/95 px-4 py-2 backdrop-blur sm:px-6">
        <button
          type="button"
          aria-label="Conversas"
          className="-ml-2 flex size-11 cursor-pointer items-center justify-center text-signal-dim transition-colors hover:text-signal md:hidden"
          onClick={() => {
            setDrawerOpen(true);
          }}
        >
          <Bars />
        </button>

        <Link href="/" className="flex items-center gap-2.5">
          <span className="monolith !h-5 !w-1.5" aria-hidden="true" />
          <span className="font-display text-[13px] font-medium tracking-[0.3em] uppercase">
            <span className="text-hal">2001</span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1">
          <CuratorSwitch curator={curator} />
          <Link
            href="/chat/new"
            className="label-caps flex min-h-11 items-center px-2 text-signal-dim transition-colors hover:text-hal"
          >
            + Nova
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Rail
          sessions={sessions}
          activeSessionId={activeSessionId}
          open={drawerOpen}
          onClose={() => {
            setDrawerOpen(false);
          }}
        />

        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}

function Rail({
  sessions,
  activeSessionId,
  open,
  onClose,
}: {
  sessions: readonly SessionSummary[];
  activeSessionId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Fechar conversas"
          className="fixed inset-0 z-30 cursor-default bg-space/70 md:hidden"
          onClick={onClose}
        />
      ) : null}

      <nav
        aria-label="Conversas"
        className={`fixed inset-y-0 left-0 z-40 w-72 overflow-y-auto border-r border-seam bg-panel transition-transform md:static md:z-auto md:w-64 md:shrink-0 md:translate-x-0 md:bg-transparent ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <p className="label-caps px-4 pt-5 pb-3">Conversas</p>

        {sessions.length === 0 ? (
          <p className="px-4 pb-5 text-[14px] leading-relaxed text-signal-faint">
            Nenhuma ainda. Escreva a primeira ao lado.
          </p>
        ) : (
          <ul className="pb-8">
            {sessions.map((session) => (
              <RailRow
                key={session.sessionId}
                session={session}
                active={session.sessionId === activeSessionId}
                onNavigate={onClose}
              />
            ))}
          </ul>
        )}

        <div className="border-t border-seam px-4 py-4">
          <Link
            href="/conversations"
            onClick={onClose}
            className="label-caps transition-colors hover:text-hal"
          >
            Dataset
          </Link>
        </div>
      </nav>
    </>
  );
}

/**
 * One conversation in the rail, with a way to throw it away.
 *
 * Deleting asks first, in place, rather than with a `confirm()` dialog: the ×
 * is a permanently visible target on a phone, where there is no hover to hide
 * behind, and a mis-tap has to cost nothing. The second tap is the one that
 * deletes.
 */
function RailRow({
  session,
  active,
  onNavigate,
}: {
  session: SessionSummary;
  active: boolean;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove(): Promise<void> {
    setDeleting(true);

    try {
      const response = await fetch(`/api/session/${session.sessionId}`, { method: 'DELETE' });

      if (!response.ok) {
        setDeleting(false);
        setConfirming(false);
        return;
      }

      // Leaving the deleted conversation open would be a dead page; the root
      // decides where to land next, exactly as it does on arrival.
      if (active) {
        router.replace('/');
      }

      router.refresh();
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <li className="border-l-2 border-hal bg-recess px-4 py-3">
        <p className="text-[14px] leading-snug text-signal">Apagar esta conversa?</p>
        <p className="mt-1 font-mono text-[10px] tracking-wider text-signal-faint uppercase">
          As avaliações registradas continuam no dataset
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={deleting}
            className="label-caps min-h-9 cursor-pointer border border-hal px-3 text-hal disabled:opacity-50"
            onClick={() => void remove()}
          >
            {deleting ? 'Apagando…' : 'Apagar'}
          </button>
          <button
            type="button"
            disabled={deleting}
            className="label-caps min-h-9 cursor-pointer border border-seam-lit px-3 text-signal-dim"
            onClick={() => {
              setConfirming(false);
            }}
          >
            Manter
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`flex items-start border-l-2 transition-colors ${
        active ? 'border-hal bg-recess' : 'border-transparent hover:bg-recess'
      }`}
    >
      <Link
        href={`/chat/${session.sessionId}`}
        onClick={onNavigate}
        className={`min-w-0 flex-1 px-4 py-3 ${active ? 'text-signal' : 'text-signal-dim'}`}
      >
        <span className="line-clamp-2 text-[14px] leading-snug">{session.opening}</span>
        <span className="label-caps mt-1.5 block">
          {session.persona ?? session.lastActivity.toISOString().slice(5, 10)}
        </span>
      </Link>

      <button
        type="button"
        aria-label="Apagar conversa"
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center text-signal-faint transition-colors hover:text-hal"
        onClick={() => {
          setConfirming(true);
        }}
      >
        ×
      </button>
    </li>
  );
}

function Bars() {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
      <g fill="currentColor">
        <rect width="18" height="1.5" y="0" />
        <rect width="18" height="1.5" y="5.25" />
        <rect width="18" height="1.5" y="10.5" />
      </g>
    </svg>
  );
}
