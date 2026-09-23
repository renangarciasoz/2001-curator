import { redirect } from 'next/navigation';

import { ChatLayout } from '@/components/chat-layout.component';
import { IndicatorChat } from '@/components/indicator-chat.component';
import { currentCurator } from '@/server/auth.service';
import { listSessions } from '@/server/session.service';

/**
 * An empty conversation, before it exists.
 *
 * No session row is written here. The session is created by the first message
 * (see `IndicatorChat`), so opening this page and walking away leaves nothing
 * behind — the rail lists conversations, not intentions.
 */
export default async function NewChatPage() {
  const curator = await currentCurator();

  if (curator === null) {
    redirect('/');
  }

  const sessions = await listSessions(curator);

  return (
    <ChatLayout curator={curator} sessions={sessions} activeSessionId={null}>
      <IndicatorChat
        sessionId={null}
        curator={curator}
        initialTranscript={{ turns: [], hasRecommended: false }}
      />
    </ChatLayout>
  );
}
