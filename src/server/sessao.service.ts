import 'server-only';

import { SessaoNaoEncontradaError } from '@/lib/app-error.util';

import { db } from './db.service';

import type { FalaDoTranscript } from '@/lib/transcript.type';
import type Anthropic from '@anthropic-ai/sdk';
import type { AutorDaMensagem, Curador } from '@prisma/client';

type BlocoDeConteudo = Anthropic.Beta.BetaContentBlockParam;

export type SessaoCarregada = {
  readonly sessaoId: string;
  readonly curador: Curador;
  readonly perfilId: string | null;
  readonly historico: readonly Anthropic.Beta.BetaMessageParam[];
};

/** Abre uma sessão de chat para uma curadora, opcionalmente ligada a uma persona. */
export async function criarSessao(curador: Curador, perfilId: string | null): Promise<string> {
  const sessao = await db.sessao.create({
    data: { curador, ...(perfilId !== null ? { perfilId } : {}) },
    select: { id: true },
  });

  return sessao.id;
}

/**
 * Carrega a sessão e reconstrói o histórico no formato da Messages API.
 *
 * Os blocos são guardados crus — texto, tool_use, tool_result e os blocos de
 * raciocínio — porque a API é sem estado e o loop precisa devolvê-los intactos
 * a cada turno.
 *
 * @throws {SessaoNaoEncontradaError} quando a sessão não existe.
 */
export async function carregarSessao(sessaoId: string): Promise<SessaoCarregada> {
  const sessao = await db.sessao.findUnique({
    where: { id: sessaoId },
    select: {
      id: true,
      curador: true,
      perfilId: true,
      mensagens: {
        select: { autor: true, blocos: true },
        orderBy: { ordem: 'asc' },
      },
    },
  });

  if (sessao === null) {
    throw new SessaoNaoEncontradaError(sessaoId);
  }

  return {
    sessaoId: sessao.id,
    curador: sessao.curador,
    perfilId: sessao.perfilId,
    historico: sessao.mensagens.map((mensagem) => ({
      role: mensagem.autor === 'INDICADOR' ? ('assistant' as const) : ('user' as const),
      content: lerBlocos(mensagem.blocos),
    })),
  };
}

/**
 * O transcript reduzido ao que a interface mostra.
 *
 * Blocos de ferramenta e de raciocínio ficam de fora: a curadora quer ver a
 * conversa, não o encanamento. Eles continuam no banco, íntegros, porque o loop
 * precisa deles a cada turno.
 */
export async function carregarTranscript(sessaoId: string): Promise<readonly FalaDoTranscript[]> {
  const sessao = await carregarSessao(sessaoId);

  return sessao.historico.flatMap((mensagem) => {
    const texto = extrairTexto(mensagem.content);

    if (texto.length === 0) {
      return [];
    }

    return [{ autor: mensagem.role === 'assistant' ? 'INDICADOR' : 'CURADORA', texto }];
  });
}

function extrairTexto(conteudo: Anthropic.Beta.BetaMessageParam['content']): string {
  if (typeof conteudo === 'string') {
    return conteudo.trim();
  }

  return conteudo
    .filter((bloco) => bloco.type === 'text')
    .map((bloco) => bloco.text)
    .join('\n')
    .trim();
}

/** Acrescenta uma mensagem ao transcript, na próxima posição livre. */
export async function gravarMensagem(
  sessaoId: string,
  autor: AutorDaMensagem,
  blocos: readonly BlocoDeConteudo[],
): Promise<void> {
  await db.$transaction(async (tx) => {
    const ultima = await tx.mensagem.findFirst({
      where: { sessaoId },
      select: { ordem: true },
      orderBy: { ordem: 'desc' },
    });

    await tx.mensagem.create({
      data: {
        sessaoId,
        autor,
        blocos: blocos as unknown as object[],
        ordem: (ultima?.ordem ?? -1) + 1,
      },
    });
  });

  await db.sessao.update({ where: { id: sessaoId }, data: { updatedAt: new Date() } });
}

/**
 * O bloco de contexto que entra no system a cada turno, depois do Método.
 *
 * É aqui que "perguntar antes de recomendar" deixa de depender só da boa vontade
 * do modelo: o que já se sabe da pessoa é listado, e o que ainda falta é listado
 * explicitamente como pergunta em aberto.
 */
export async function montarContextoDaSessao(sessao: SessaoCarregada): Promise<string> {
  const linhas: string[] = [`Quem está conversando com você agora: ${sessao.curador}.`];

  if (sessao.perfilId === null) {
    linhas.push(
      '',
      'Não há perfil de espectador ligado a esta sessão. Você ainda não sabe nada',
      'sobre para quem é a indicação. Perguntas em aberto — faça-as antes de indicar:',
      '  - qual foi o último filme que emocionou a pessoa;',
      '  - se ela busca conforto, desafio ou descoberta;',
      '  - para quem é, que idade tem, como está hoje;',
      '  - que repertório ela já tem.',
    );

    return linhas.join('\n');
  }

  const perfil = await db.perfil.findUnique({
    where: { id: sessao.perfilId },
    select: {
      usuarioId: true,
      gostos: true,
      evita: true,
      repertorio: true,
      momentoDeVida: true,
      nivel: true,
      jaAssistiu: { select: { filme: { select: { titulo: true, ano: true } } }, take: 50 },
      historicoDeJornadas: { select: { jornada: { select: { titulo: true } } }, take: 20 },
    },
  });

  if (perfil === null) {
    linhas.push('', 'O perfil ligado a esta sessão não foi encontrado. Trate como pessoa nova.');

    return linhas.join('\n');
  }

  linhas.push('', `Espectador desta sessão: ${perfil.usuarioId} (tratamento: ${perfil.nivel}).`);

  const emAberto: string[] = [];

  acrescentar(linhas, emAberto, 'Gosta de', perfil.gostos.join(', '), 'o que ela gosta');
  acrescentar(linhas, emAberto, 'Evita', perfil.evita.join(', '), 'o que ela evita');
  acrescentar(linhas, emAberto, 'Repertório', perfil.repertorio ?? '', 'que repertório ela tem');
  acrescentar(
    linhas,
    emAberto,
    'Momento de vida',
    perfil.momentoDeVida ?? '',
    'como ela está hoje',
  );

  const assistidos = perfil.jaAssistiu
    .map((item) => `${item.filme.titulo}${item.filme.ano !== null ? ` (${String(item.filme.ano)})` : ''}`)
    .join('; ');

  acrescentar(linhas, emAberto, 'Já assistiu', assistidos, 'o que ela já viu');

  const jornadas = perfil.historicoDeJornadas.map((item) => item.jornada.titulo).join('; ');

  if (jornadas.length > 0) {
    linhas.push(`Jornadas por onde já passou: ${jornadas}`);
  }

  if (emAberto.length > 0) {
    linhas.push('', 'Perguntas em aberto — resolva antes de indicar:');
    linhas.push(...emAberto.map((pergunta) => `  - ${pergunta};`));
  } else {
    linhas.push('', 'Há contexto suficiente sobre esta pessoa. Pode indicar com justificativa.');
  }

  return linhas.join('\n');
}

function acrescentar(
  linhas: string[],
  emAberto: string[],
  rotulo: string,
  valor: string,
  perguntaSeFaltar: string,
): void {
  if (valor.trim().length === 0) {
    emAberto.push(perguntaSeFaltar);
    return;
  }

  linhas.push(`${rotulo}: ${valor}`);
}

/**
 * Converte o JSON do Postgres de volta em blocos de conteúdo.
 *
 * Fronteira de desserialização: o banco devolve `JsonValue` e o que foi gravado
 * ali sempre veio da própria Messages API. Um array vazio é a degradação segura
 * se a linha estiver corrompida — melhor uma mensagem vazia que uma exceção que
 * derruba a sessão inteira.
 */
function lerBlocos(valor: unknown): BlocoDeConteudo[] {
  if (!Array.isArray(valor)) {
    return [];
  }

  return valor as unknown as BlocoDeConteudo[];
}
