import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { IndicatorChat } from '@/components/indicator-chat.component';
import { curatorLabel } from '@/lib/curator.constant';
import { currentCurator } from '@/server/auth.service';
import { db } from '@/server/db.service';
import { loadTranscript } from '@/server/session.service';

export default async function ChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const curator = await currentCurator();

  if (curator === null) {
    redirect('/');
  }

  const { sessionId } = await params;

  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { id: true, curator: true, profile: { select: { userId: true } } },
  });

  if (session === null) {
    notFound();
  }

  // One curator does not enter the other's session: attributing each review in
  // the dataset depends on who was actually having the conversation.
  if (session.curator !== curator) {
    notFound();
  }

  const transcript = await loadTranscript(sessionId);

  return (
    <main>
      <div className="header">
        <div>
          <h1>Conversa</h1>
          <p className="muted">
            {curatorLabel(curator)}
            {session.profile !== null ? ` · persona ${session.profile.userId}` : ' · sem persona'}
          </p>
        </div>
        <Link href="/">Início</Link>
      </div>

      <IndicatorChat
        sessionId={sessionId}
        curator={curator}
        initialTranscript={transcript}
      />
    </main>
  );
}
