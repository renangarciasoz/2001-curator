import { redirect } from 'next/navigation';

import { CuratorPicker } from '@/components/curator-picker.component';
import { currentCurator } from '@/server/auth.service';
import { listSessions } from '@/server/session.service';

/**
 * The root does not render anything of its own: it decides where the curator
 * lands.
 *
 * There used to be a dashboard here — counts, links, a button to open a
 * session. That is one screen between the curator and the only thing she came
 * to do. So: pick up the last conversation if there is one, otherwise start a
 * new one. The counts moved to the dataset page, where they belong.
 */
export default async function Home() {
  const curator = await currentCurator();

  if (curator === null) {
    return <CuratorPicker />;
  }

  const [latest] = await listSessions(curator, 1);

  redirect(latest !== undefined ? `/chat/${latest.sessionId}` : '/chat/new');
}
