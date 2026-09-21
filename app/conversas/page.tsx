import Link from 'next/link';
import { redirect } from 'next/navigation';

import { nomeDaCuradora } from '@/lib/curadora.constant';
import { curadoraAtual } from '@/server/auth.service';
import { db } from '@/server/db.service';

const LIMITE = 100;

const ROTULO_DA_QUALIDADE: Readonly<Record<string, string>> = {
  ABSORVE: 'absorve',
  REVISAR: 'revisar',
  DESCARTA: 'descarta',
};

const ROTULO_DO_CONSENSO: Readonly<Record<string, string>> = {
  ACORDO: 'acordo',
  DIVERGENCIA: 'divergência',
  SO_UMA_AVALIOU: 'só uma avaliou',
};

export default async function PaginaDeConversas() {
  const curadora = await curadoraAtual();

  if (curadora === null) {
    redirect('/');
  }

  const conversas = await db.conversa.findMany({
    select: {
      id: true,
      pedidoDoUsuario: true,
      correcao: true,
      porqueDaCorrecao: true,
      notaDaDivergencia: true,
      avaliadoPor: true,
      consenso: true,
      qualidade: true,
      confianca: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: LIMITE,
  });

  return (
    <main>
      <div className="cabecalho">
        <div>
          <h1>Conversas registradas</h1>
          <p className="sutil">
            O dataset curatorial. Só as conversas com qualidade <em>absorve</em> são exportadas
            para a Fase 2.
          </p>
        </div>
        <Link href="/">Início</Link>
      </div>

      <div className="acoes">
        <a href="/api/exportar">Baixar dataset (JSONL)</a>
      </div>

      {conversas.length === 0 ? (
        <p className="aviso">
          Nenhuma conversa avaliada ainda. Abra um chat, receba uma indicação e avalie-a.
        </p>
      ) : (
        <div className="rolagem">
          <table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Avaliação</th>
                <th>Correção e porquê</th>
              </tr>
            </thead>
            <tbody>
              {conversas.map((conversa) => (
                <tr key={conversa.id}>
                  <td>
                    {conversa.pedidoDoUsuario}
                    <br />
                    <span className="sutil">
                      {conversa.createdAt.toISOString().slice(0, 10)}
                    </span>
                  </td>
                  <td>
                    <span className="etiqueta">
                      {conversa.qualidade !== null
                        ? (ROTULO_DA_QUALIDADE[conversa.qualidade] ?? conversa.qualidade)
                        : 'pendente'}
                    </span>{' '}
                    <span className="etiqueta">
                      {conversa.consenso !== null
                        ? (ROTULO_DO_CONSENSO[conversa.consenso] ?? conversa.consenso)
                        : '—'}
                    </span>
                    <br />
                    <span className="sutil">
                      {conversa.avaliadoPor !== null ? nomeDaCuradora(conversa.avaliadoPor) : '—'}
                      {conversa.confianca !== null
                        ? ` · confiança ${conversa.confianca.toLowerCase()}`
                        : ''}
                    </span>
                  </td>
                  <td>
                    {conversa.notaDaDivergencia !== null ? (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{conversa.notaDaDivergencia}</div>
                    ) : null}
                    {conversa.correcao !== null ? <div>{conversa.correcao}</div> : null}
                    {conversa.porqueDaCorrecao !== null ? (
                      <div className="sutil">Porquê: {conversa.porqueDaCorrecao}</div>
                    ) : null}
                    {conversa.notaDaDivergencia === null && conversa.correcao === null ? (
                      <span className="sutil">sem correção</span>
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
