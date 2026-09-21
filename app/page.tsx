import Link from 'next/link';

import { CuratorPicker } from '@/components/curator-picker.component';
import { OpenSession } from '@/components/open-session.component';
import { PageShell } from '@/components/page-shell.component';
import { SessionList } from '@/components/session-list.component';
import { currentCurator } from '@/server/auth.service';
import { db } from '@/server/db.service';
import { env } from '@/server/env.config';
import { listSessions } from '@/server/session.service';

export default async function Home() {
  const curator = await currentCurator();

  if (curator === null) {
    return (
      <PageShell
        title="Uma curadoria viva."
        lede="Ferramenta interna da 2001 Vídeo. Identifique-se para começar."
      >
        <CuratorPicker requiresPassword={env.APP_CURATION_PASSWORD.length > 0} />
      </PageShell>
    );
  }

  const [films, curated, absorbed, underReview, sessions] = await Promise.all([
    db.film.count(),
    db.film.count({ where: { curatorialSource: 'CURATION_2001' } }),
    db.conversation.count({ where: { quality: 'ABSORB' } }),
    db.conversation.count({ where: { quality: 'REVIEW' } }),
    listSessions(curator),
  ]);

  return (
    <PageShell
      curator={curator}
      eyebrow="Estado do acervo"
      title="O acervo hoje"
      lede="Cada conversa avaliada aqui vira o dado que treina o modelo próprio na Fase 2."
    >
      <OpenSession />

      <SessionList sessions={sessions} />

      <dl className="mt-14 grid grid-cols-2 gap-px border border-seam bg-seam sm:grid-cols-4">
        <Readout label="Filmes" value={films} />
        <Readout
          label="Com curadoria"
          value={curated}
          footnote={films > curated ? `${String(films - curated)} sem estudo` : undefined}
        />
        <Readout label="Absorvidas" value={absorbed} />
        <Readout label="Em revisão" value={underReview} alert={underReview > 0} />
      </dl>

      <p className="mt-6 text-[15px] leading-relaxed text-signal-dim">
        <Link href="/conversations" className="text-hal hover:underline hover:underline-offset-4">
          Ver as conversas registradas
        </Link>{' '}
        — e baixar o dataset.
      </p>
    </PageShell>
  );
}

/** An instrument readout: legend above, figure below, nothing else. */
function Readout({
  label,
  value,
  footnote,
  alert = false,
}: {
  label: string;
  value: number;
  footnote?: string | undefined;
  alert?: boolean;
}) {
  return (
    <div className="bg-panel px-4 py-5">
      <dt className="label-caps">{label}</dt>
      <dd
        className={`mt-2 font-display text-[34px] leading-none font-light tabular-nums ${
          alert ? 'text-hal' : 'text-signal'
        }`}
      >
        {value}
      </dd>
      {footnote !== undefined ? (
        <p className="mt-2 font-mono text-[10px] tracking-wider text-signal-faint">{footnote}</p>
      ) : null}
    </div>
  );
}
