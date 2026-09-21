import { notFound, redirect } from 'next/navigation';

import { IndicatorChat } from '@/components/indicator-chat.component';
import { PageShell } from '@/components/page-shell.component';
import { currentCurator } from '@/server/auth.service';
import { db } from '@/server/db.service';
import { loadTranscript } from '@/server/session.service';

export default async function ChatPage({ params }: { params: Promise<{ sessionId: string }> }) {
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
    <PageShell
      curator={curator}
      eyebrow={
        session.profile !== null ? `Persona · ${session.profile.userId}` : 'Conversa avulsa'
      }
      title="Conversa"
    >
      <IndicatorChat sessionId={sessionId} curator={curator} initialTranscript={transcript} />
    </PageShell>
  );
}
