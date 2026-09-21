import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { ChatDoIndicador } from '@/components/chat-do-indicador.component';
import { nomeDaCuradora } from '@/lib/curadora.constant';
import { curadoraAtual } from '@/server/auth.service';
import { db } from '@/server/db.service';
import { carregarTranscript } from '@/server/sessao.service';

export default async function PaginaDoChat({
  params,
}: {
  params: Promise<{ sessaoId: string }>;
}) {
  const curadora = await curadoraAtual();

  if (curadora === null) {
    redirect('/');
  }

  const { sessaoId } = await params;

  const sessao = await db.sessao.findUnique({
    where: { id: sessaoId },
    select: { id: true, curador: true, perfil: { select: { usuarioId: true } } },
  });

  // Uma curadora não entra na sessão da outra: a atribuição de cada avaliação
  // no dataset depende de quem estava de fato conversando.
  if (sessao === null || sessao.curador !== curadora) {
    notFound();
  }

  const transcript = await carregarTranscript(sessaoId);

  return (
    <main>
      <div className="cabecalho">
        <div>
          <h1>Conversa</h1>
          <p className="sutil">
            {nomeDaCuradora(curadora)}
            {sessao.perfil !== null ? ` · persona ${sessao.perfil.usuarioId}` : ' · sem persona'}
          </p>
        </div>
        <Link href="/">Início</Link>
      </div>

      <ChatDoIndicador
        sessaoId={sessaoId}
        curadora={curadora}
        transcriptInicial={transcript}
      />
    </main>
  );
}
