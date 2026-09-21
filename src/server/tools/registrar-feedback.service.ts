import 'server-only';

import { z } from 'zod';

import { ConversaNaoEncontradaError } from '@/lib/app-error.util';

import { db } from '../db.service';

import { aplicarPortaoDeQualidade } from './portao-de-qualidade.util';

import type { AvaliacaoDeCuradora, DecisaoDoPortao } from './portao-de-qualidade.util';
import type { Prisma } from '@prisma/client';

/** O Método admite no máximo três opções por vez. O schema recusa a quarta. */
const MAXIMO_DE_OPCOES = 3;

export const RegistrarFeedbackInputSchema = z.object({
  conversa_id: z.uuid().optional().describe('Conversa já aberta; omita para criar uma nova.'),
  sessao_id: z.uuid().optional(),
  perfil_id: z.uuid().optional(),

  pedido_do_usuario: z.string().min(1).describe('O que a pessoa queria, nas palavras dela.'),
  perguntas_da_ia: z
    .array(z.string())
    .default([])
    .describe('O que o Indicador perguntou antes de indicar.'),
  recomendacao_da_ia: z
    .string()
    .min(1)
    .describe('O que o Indicador sugeriu, com a justificativa de cada opção.'),

  avaliacoes: z
    .array(
      z.object({
        curador: z.enum(['SONIA', 'MIRELLA']),
        houve_correcao: z.boolean(),
        correcao: z.string().optional().describe('A indicação que entra no lugar.'),
        porque: z.string().optional().describe('Obrigatório quando há correção.'),
      }),
    )
    .min(1)
    .max(2),
  as_duas_concordam: z
    .boolean()
    .optional()
    .describe('Só quando as duas corrigiram: as leituras são a mesma?'),

  filmes_recomendados: z.array(z.uuid()).max(MAXIMO_DE_OPCOES).default([]),
  filmes_corrigidos: z.array(z.uuid()).max(MAXIMO_DE_OPCOES).default([]),
});

export type RegistrarFeedbackInput = z.infer<typeof RegistrarFeedbackInputSchema>;

export type ResultadoDoFeedback = {
  conversa_id: string;
  avaliado_por: string;
  consenso: string;
  qualidade: string;
  confianca: string | null;
  /** Frase pronta para o Indicador devolver à curadora. */
  resumo: string;
};

/**
 * Grava a avaliação de uma recomendação depois de passar pelo portão de qualidade.
 *
 * Nada é gravado se o portão pedir esclarecimento: a tool levanta
 * `FeedbackAmbiguoError` e quem chama deve perguntar, não descartar em silêncio.
 *
 * @throws {FeedbackAmbiguoError} feedback insuficiente para virar dado.
 * @throws {ConversaNaoEncontradaError} `conversa_id` informado não existe.
 */
export async function registrarFeedback(
  input: RegistrarFeedbackInput,
): Promise<ResultadoDoFeedback> {
  const decisao = aplicarPortaoDeQualidade(
    input.avaliacoes.map(converterAvaliacao),
    input.as_duas_concordam,
  );

  const conversaId = await persistir(input, decisao);

  return {
    conversa_id: conversaId,
    avaliado_por: decisao.avaliadoPor,
    consenso: decisao.consenso,
    qualidade: decisao.qualidade,
    confianca: decisao.confianca,
    resumo: resumir(decisao),
  };
}

/**
 * Marca uma conversa como descartada quando a curadora não quis esclarecer o
 * feedback ambíguo. Registrar o descarte é melhor que apagar: o dataset da Fase 2
 * precisa saber que aquela recomendação foi avaliada e não aproveitada.
 *
 * @throws {ConversaNaoEncontradaError} quando a conversa não existe.
 */
export async function descartarFeedback(conversaId: string, motivo: string): Promise<void> {
  const existe = await db.conversa.findUnique({ where: { id: conversaId }, select: { id: true } });

  if (existe === null) {
    throw new ConversaNaoEncontradaError(conversaId);
  }

  await db.conversa.update({
    where: { id: conversaId },
    data: {
      qualidade: 'DESCARTA',
      confianca: null,
      correcao: null,
      porqueDaCorrecao: null,
      notaDaDivergencia: `Descartado sem esclarecimento. Motivo registrado: ${motivo}`,
    },
  });
}

export const DescartarNovoSchema = z.object({
  sessao_id: z.uuid().optional(),
  pedido_do_usuario: z.string().min(1),
  perguntas_da_ia: z.array(z.string()).default([]),
  recomendacao_da_ia: z.string().min(1),
  avaliado_por: z.enum(['SONIA', 'MIRELLA']),
  motivo: z.string().trim().min(1).max(2000),
});

export type DescartarNovoInput = z.infer<typeof DescartarNovoSchema>;

/**
 * Registra uma avaliação que não virou dado porque a curadora não quis
 * detalhar o porquê.
 *
 * O portão recusou, então não há linha ainda — e simplesmente não gravar nada
 * faria a Fase 2 concluir que ninguém avaliou aquela recomendação. Gravar o
 * descarte preserva a diferença entre "não avaliado" e "avaliado e recusado".
 */
export async function registrarDescarteNovo(input: DescartarNovoInput): Promise<string> {
  const conversa = await db.conversa.create({
    data: {
      ...(input.sessao_id !== undefined ? { sessaoId: input.sessao_id } : {}),
      pedidoDoUsuario: input.pedido_do_usuario,
      perguntasDaIa: input.perguntas_da_ia as Prisma.InputJsonValue,
      recomendacaoDaIa: input.recomendacao_da_ia,
      avaliadoPor: input.avaliado_por,
      notaDaDivergencia: `Descartado sem esclarecimento. Motivo registrado: ${input.motivo}`,
      qualidade: 'DESCARTA',
    },
    select: { id: true },
  });

  return conversa.id;
}

function converterAvaliacao(
  avaliacao: RegistrarFeedbackInput['avaliacoes'][number],
): AvaliacaoDeCuradora {
  return {
    curador: avaliacao.curador,
    houveCorrecao: avaliacao.houve_correcao,
    ...(avaliacao.correcao !== undefined ? { correcao: avaliacao.correcao } : {}),
    ...(avaliacao.porque !== undefined ? { porque: avaliacao.porque } : {}),
  };
}

async function persistir(
  input: RegistrarFeedbackInput,
  decisao: DecisaoDoPortao,
): Promise<string> {
  const dados = {
    pedidoDoUsuario: input.pedido_do_usuario,
    perguntasDaIa: input.perguntas_da_ia as Prisma.InputJsonValue,
    recomendacaoDaIa: input.recomendacao_da_ia,
    correcao: decisao.correcao,
    porqueDaCorrecao: decisao.porqueDaCorrecao,
    avaliadoPor: decisao.avaliadoPor,
    notaDaDivergencia: decisao.notaDaDivergencia,
    consenso: decisao.consenso,
    qualidade: decisao.qualidade,
    confianca: decisao.confianca,
  };

  return db.$transaction(async (tx) => {
    const conversaId = await gravarConversa(tx, input, dados);

    await tx.conversaFilme.deleteMany({ where: { conversaId } });

    const vinculos = [
      ...input.filmes_recomendados.map((filmeId, ordem) => ({
        conversaId,
        filmeId,
        papel: 'RECOMENDADO_PELA_IA' as const,
        ordem,
      })),
      ...input.filmes_corrigidos.map((filmeId, ordem) => ({
        conversaId,
        filmeId,
        papel: 'CORRIGIDO_PELA_CURADORA' as const,
        ordem,
      })),
    ];

    if (vinculos.length > 0) {
      await tx.conversaFilme.createMany({ data: vinculos, skipDuplicates: true });
    }

    return conversaId;
  });
}

async function gravarConversa(
  tx: Prisma.TransactionClient,
  input: RegistrarFeedbackInput,
  dados: Prisma.ConversaUncheckedUpdateInput & Prisma.ConversaUncheckedCreateInput,
): Promise<string> {
  if (input.conversa_id === undefined) {
    const criada = await tx.conversa.create({
      data: {
        ...dados,
        ...(input.sessao_id !== undefined ? { sessaoId: input.sessao_id } : {}),
        ...(input.perfil_id !== undefined ? { perfilId: input.perfil_id } : {}),
      },
      select: { id: true },
    });

    return criada.id;
  }

  const existe = await tx.conversa.findUnique({
    where: { id: input.conversa_id },
    select: { id: true },
  });

  if (existe === null) {
    throw new ConversaNaoEncontradaError(input.conversa_id);
  }

  const atualizada = await tx.conversa.update({
    where: { id: input.conversa_id },
    data: dados,
    select: { id: true },
  });

  return atualizada.id;
}

function resumir(decisao: DecisaoDoPortao): string {
  switch (decisao.consenso) {
    case 'ACORDO':
      return 'Sonia e Mirella chegaram à mesma leitura. Registrado como dado de treino com confiança alta.';
    case 'SO_UMA_AVALIOU':
      return `Avaliação de ${decisao.avaliadoPor} registrada com confiança normal. A segunda leitura ainda pode entrar.`;
    case 'DIVERGENCIA':
      return 'As duas leituras foram registradas lado a lado, sem eleger vencedora. Marcado para revisão — a divergência é o dado.';
    default: {
      const _exaustivo: never = decisao.consenso;
      throw new Error(`consenso não tratado: ${_exaustivo as string}`);
    }
  }
}
