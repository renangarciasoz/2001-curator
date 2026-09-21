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
        lede="Ferramenta interna da 2001 Vídeo. Entre para começar uma conversa."
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
      eyebrow="Edição corrente"
      title="O acervo hoje"
      lede="Cada conversa avaliada aqui vira o dado que treina o modelo próprio na Fase 2."
    >
      <OpenSession />

      <SessionList sessions={sessions} />

      <dl className="mt-12 grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-4">
        <Figure label="Filmes" value={films} />
        <Figure
          label="Com curadoria"
          value={curated}
          footnote={films > curated ? `${String(films - curated)} sem estudo` : undefined}
        />
        <Figure label="Absorvidas" value={absorbed} />
        <Figure label="Em revisão" value={underReview} accent={underReview > 0} />
      </dl>

      <p className="mt-6 text-[15px] leading-relaxed text-ink-soft">
        <Link href="/conversations" className="text-accent underline underline-offset-4">
          Ver as conversas registradas
        </Link>{' '}
        — e baixar o dataset.
      </p>
    </PageShell>
  );
}

function Figure({
  label,
  value,
  footnote,
  accent = false,
}: {
  label: string;
  value: number;
  footnote?: string | undefined;
  accent?: boolean;
}) {
  return (
    <div className="bg-paper-raised px-4 py-5">
      <dt className="label-caps">{label}</dt>
      <dd
        className={`font-display text-[32px] leading-none tracking-tight ${
          accent ? 'text-accent' : ''
        }`}
      >
        {value}
      </dd>
      {footnote !== undefined ? (
        <p className="mt-1.5 font-label text-[11px] text-ink-faint">{footnote}</p>
      ) : null}
    </div>
  );
}
