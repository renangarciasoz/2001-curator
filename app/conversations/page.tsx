import Link from 'next/link';
import { redirect } from 'next/navigation';

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
    <main>
      <div className="header">
        <div>
          <h1>Conversas registradas</h1>
          <p className="muted">
            O dataset curatorial. Só as conversas com qualidade <em>absorve</em> são exportadas para
            a Fase 2.
          </p>
        </div>
        <Link href="/">Início</Link>
      </div>

      <div className="actions">
        <a href="/api/export">Baixar dataset (JSONL)</a>
      </div>

      {conversations.length === 0 ? (
        <p className="notice">
          Nenhuma conversa avaliada ainda. Abra um chat, receba uma indicação e avalie-a.
        </p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Avaliação</th>
                <th>Correção e porquê</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((conversation) => (
                <tr key={conversation.id}>
                  <td>
                    {conversation.userRequest}
                    <br />
                    <span className="muted">
                      {conversation.createdAt.toISOString().slice(0, 10)}
                    </span>
                  </td>
                  <td>
                    <span className="tag">
                      {conversation.quality !== null
                        ? (QUALITY_LABEL[conversation.quality] ?? conversation.quality)
                        : 'pendente'}
                    </span>{' '}
                    <span className="tag">
                      {conversation.consensus !== null
                        ? (CONSENSUS_LABEL[conversation.consensus] ?? conversation.consensus)
                        : '—'}
                    </span>
                    <br />
                    <span className="muted">
                      {conversation.reviewedBy !== null
                        ? curatorLabel(conversation.reviewedBy)
                        : '—'}
                      {conversation.confidence !== null
                        ? ` · confiança ${CONFIDENCE_LABEL[conversation.confidence] ?? conversation.confidence}`
                        : ''}
                    </span>
                  </td>
                  <td>
                    {conversation.disagreementNote !== null ? (
                      <div className="pre-wrap">{conversation.disagreementNote}</div>
                    ) : null}
                    {conversation.correction !== null ? <div>{conversation.correction}</div> : null}
                    {conversation.correctionReason !== null ? (
                      <div className="muted">Porquê: {conversation.correctionReason}</div>
                    ) : null}
                    {conversation.disagreementNote === null && conversation.correction === null ? (
                      <span className="muted">sem correção</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
