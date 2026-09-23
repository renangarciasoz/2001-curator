import { notFound, redirect } from 'next/navigation';

import { ChatLayout } from '@/components/chat-layout.component';
import { IndicatorChat } from '@/components/indicator-chat.component';
import { currentCurator } from '@/server/auth.service';
import { db } from '@/server/db.service';
import { listSessions, loadTranscript } from '@/server/session.service';

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

  const [transcript, sessions] = await Promise.all([
    loadTranscript(sessionId),
    listSessions(curator),
  ]);

  return (
    <ChatLayout curator={curator} sessions={sessions} activeSessionId={sessionId}>
      <IndicatorChat
        sessionId={sessionId}
        curator={curator}
        initialTranscript={transcript}
        personaName={session.profile?.userId ?? null}
      />
    </ChatLayout>
  );
}
