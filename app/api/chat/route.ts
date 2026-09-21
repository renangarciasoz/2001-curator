import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { SessaoNaoEncontradaError, descreverErro } from '@/lib/app-error.util';
import { exigirCuradora } from '@/server/auth.service';
import { db } from '@/server/db.service';
import { conversarComOIndicador } from '@/server/indicador/orquestrador.service';
import { responderErro } from '@/server/resposta-http.util';

import type { EventoDoIndicador } from '@/server/indicador/orquestrador.service';

const ConversarSchema = z.object({
  sessaoId: z.uuid(),
  mensagem: z.string().trim().min(1).max(8000),
});

/**
 * Um turno de conversa, transmitido como SSE.
 *
 * Streaming aqui não é enfeite: o Indicador consulta o acervo antes de
 * responder, e sem o texto chegando aos poucos a curadora fica olhando para uma
 * tela parada por dezenas de segundos sem saber se algo está acontecendo.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const curadora = await exigirCuradora();
    const { sessaoId, mensagem } = ConversarSchema.parse(await request.json());

    await exigirSessaoDaCuradora(sessaoId, curadora);

    return transmitir(conversarComOIndicador(sessaoId, mensagem, request.signal));
  } catch (e) {
    return responderErro(e);
  }
}

/** Uma curadora não lê nem escreve na sessão da outra. */
async function exigirSessaoDaCuradora(sessaoId: string, curadora: string): Promise<void> {
  const sessao = await db.sessao.findUnique({
    where: { id: sessaoId },
    select: { curador: true },
  });

  if (sessao === null || sessao.curador !== curadora) {
    // Mesma resposta para "não existe" e "não é sua": não revela a diferença.
    throw new SessaoNaoEncontradaError(sessaoId);
  }
}

function transmitir(eventos: AsyncGenerator<EventoDoIndicador>): Response {
  const codificador = new TextEncoder();

  const corpo = new ReadableStream<Uint8Array>({
    async start(controlador) {
      try {
        for await (const evento of eventos) {
          controlador.enqueue(codificador.encode(`data: ${JSON.stringify(evento)}\n\n`));
        }
      } catch (e) {
        console.error(`Stream do chat interrompido: ${descreverErro(e)}`);

        const falha: EventoDoIndicador = {
          tipo: 'erro',
          codigo: 'stream_interrompido',
          mensagem: 'A conversa foi interrompida. Recarregue a página.',
        };

        controlador.enqueue(codificador.encode(`data: ${JSON.stringify(falha)}\n\n`));
      } finally {
        controlador.close();
      }
    },
  });

  return new NextResponse(corpo, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      // O buffer de proxies quebra SSE; este cabeçalho desliga o do nginx.
      'x-accel-buffering': 'no',
    },
  });
}
