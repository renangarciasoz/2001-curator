import { redirect } from 'next/navigation';

import { PageShell } from '@/components/page-shell.component';
import { curatorLabel } from '@/lib/curator.constant';
import { currentCurator } from '@/server/auth.service';
import { db } from '@/server/db.service';

const LIMIT = 100;

/** Portuguese: these labels are read by the curators. */
const QUALITY_LABEL: Readonly<Record<string, string>> = {
  ABSORB: 'absorve',
  REVIEW: 'revisar',
  DISCARD: 'descarta',
};

const CONSENSUS_LABEL: Readonly<Record<string, string>> = {
  AGREEMENT: 'acordo',
  DISAGREEMENT: 'divergência',
  ONLY_ONE_REVIEWED: 'só uma avaliou',
};

const CONFIDENCE_LABEL: Readonly<Record<string, string>> = {
  HIGH: 'alta',
  NORMAL: 'normal',
};

/** Only `REVIEW` earns the accent: a disagreement is the one thing to go back to. */
const QUALITY_TONE: Readonly<Record<string, string>> = {
  ABSORB: 'border-affirm text-affirm',
  REVIEW: 'border-accent text-accent',
  DISCARD: 'border-rule text-ink-faint',
};

export default async function ConversationsPage() {
  const curator = await currentCurator();

  if (curator === null) {
    redirect('/');
  }

  const conversations = await db.conversation.findMany({
    select: {
      id: true,
      userRequest: true,
      correction: true,
      correctionReason: true,
      disagreementNote: true,
      reviewedBy: true,
      consensus: true,
      quality: true,
      confidence: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: LIMIT,
  });

  return (
    <PageShell
      curator={curator}
      eyebrow="O dataset curatorial"
      title="Conversas registradas"
      lede={
        <>
          Só as conversas com qualidade <em>absorve</em> são exportadas para a Fase 2. Uma
          divergência fica registrada inteira e vai para revisão — ela é dado, não é rótulo.
        </>
      }
      width="wide"
    >
      <div className="mb-8 border-t-2 border-ink pt-4">
        <a href="/api/export" className="btn btn-quiet">
          Baixar dataset (JSONL)
        </a>
      </div>

      {conversations.length === 0 ? (
        <p className="note">
          Nenhuma conversa avaliada ainda. Abra um chat, receba uma indicação e avalie-a.
        </p>
      ) : (
        <ol className="space-y-px bg-rule">
          {conversations.map((conversation) => (
            <li key={conversation.id} className="bg-paper-raised px-5 py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <p className="label-caps">
                  {conversation.createdAt.toISOString().slice(0, 10)}
                  {conversation.reviewedBy !== null
                    ? ` · ${curatorLabel(conversation.reviewedBy)}`
                    : ''}
                  {conversation.consensus !== null
                    ? ` · ${CONSENSUS_LABEL[conversation.consensus] ?? conversation.consensus}`
                    : ''}
                  {conversation.confidence !== null
                    ? ` · confiança ${CONFIDENCE_LABEL[conversation.confidence] ?? conversation.confidence}`
                    : ''}
                </p>

                {conversation.quality !== null ? (
                  <span
                    className={`label-caps border-l-2 pl-2 ${
                      QUALITY_TONE[conversation.quality] ?? 'border-rule'
                    }`}
                  >
                    {QUALITY_LABEL[conversation.quality] ?? conversation.quality}
                  </span>
                ) : (
                  <span className="label-caps border-l-2 border-rule pl-2">pendente</span>
                )}
              </div>

              <p className="mt-3 text-[17px] leading-[1.6] text-pretty">
                {conversation.userRequest}
              </p>

              {conversation.disagreementNote !== null ? (
                <div className="mt-4 border-l-2 border-accent pl-4 text-[15px] leading-relaxed whitespace-pre-wrap text-ink-soft">
                  {conversation.disagreementNote}
                </div>
              ) : null}

              {conversation.correction !== null ? (
                <div className="mt-4 border-l-2 border-rule-strong pl-4">
                  <p className="label-caps mb-1">Correção</p>
                  <p className="text-[15px] leading-relaxed">{conversation.correction}</p>
                  {conversation.correctionReason !== null ? (
                    <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
                      <span className="label-caps">Porquê</span> {conversation.correctionReason}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {conversation.disagreementNote === null && conversation.correction === null ? (
                <p className="mt-3 font-label text-[13px] text-ink-faint italic">sem correção</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </PageShell>
  );
}
