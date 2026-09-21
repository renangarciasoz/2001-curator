import 'server-only';

import { FeedbackAmbiguoError } from '@/lib/app-error.util';

import type { Confianca, Consenso, Curador, Qualidade } from '@prisma/client';

/** Justificativa mais curta que isto não sustenta uma decisão de curadoria. */
const TAMANHO_MINIMO_DO_PORQUE = 15;

/**
 * Respostas que parecem um porquê mas não são. A lista é curta de propósito:
 * o objetivo é pegar o reflexo ("não gostei"), não julgar a qualidade do texto.
 */
const PORQUES_VAZIOS: ReadonlySet<string> = new Set([
  'nao',
  'sim',
  'ruim',
  'bom',
  'errado',
  'certo',
  'melhor',
  'pior',
  'trocar',
  'nao gostei',
  'nao curti',
  'sei la',
  'acho que nao',
  'nao serve',
  'nao combina',
]);

export type AvaliacaoDeCuradora = {
  readonly curador: 'SONIA' | 'MIRELLA';
  readonly houveCorrecao: boolean;
  readonly correcao?: string;
  readonly porque?: string;
};

export type DecisaoDoPortao = {
  readonly avaliadoPor: Curador;
  readonly consenso: Consenso;
  readonly qualidade: Qualidade;
  readonly confianca: Confianca | null;
  readonly correcao: string | null;
  readonly porqueDaCorrecao: string | null;
  readonly notaDaDivergencia: string | null;
};

/**
 * O portão de qualidade: decide o que uma avaliação vira no dataset.
 *
 *  - as duas concordam        → ABSORVE, confiança ALTA
 *  - só uma avaliou           → ABSORVE, confiança NORMAL
 *  - as duas divergem         → REVISAR, as duas leituras registradas, sem vencedor
 *  - feedback pobre ou ambíguo→ não grava; pede esclarecimento
 *
 * Divergência nunca é descartada e nunca elege um lado. A pluralidade de
 * olhares entre Sonia e Mirella é um ativo do dataset, não um defeito a resolver.
 *
 * @param asDuasConcordam Declaração explícita, necessária só quando as duas
 *   curadoras corrigiram: não dá para inferir acordo comparando texto livre, e
 *   inferir errado silenciaria uma divergência ou inventaria uma.
 * @throws {FeedbackAmbiguoError} quando falta o porquê, ou quando as duas
 *   corrigiram sem dizer se chegaram à mesma leitura.
 */
export function aplicarPortaoDeQualidade(
  avaliacoes: readonly AvaliacaoDeCuradora[],
  asDuasConcordam?: boolean,
): DecisaoDoPortao {
  if (avaliacoes.length === 0) {
    throw new FeedbackAmbiguoError('Nenhuma curadora avaliou esta recomendação ainda.');
  }

  if (avaliacoes.length > 2) {
    throw new FeedbackAmbiguoError(
      'Só Sonia e Mirella avaliam. Envie no máximo uma avaliação de cada.',
    );
  }

  for (const avaliacao of avaliacoes) {
    exigirPorque(avaliacao);
  }

  const [primeira, segunda] = avaliacoes;

  if (primeira === undefined) {
    throw new FeedbackAmbiguoError('Nenhuma curadora avaliou esta recomendação ainda.');
  }

  if (segunda === undefined) {
    return decidirComUmaAvaliacao(primeira);
  }

  if (primeira.curador === segunda.curador) {
    throw new FeedbackAmbiguoError(
      `Chegaram duas avaliações de ${primeira.curador}. Cada curadora avalia uma vez.`,
    );
  }

  return decidirComDuasAvaliacoes(primeira, segunda, asDuasConcordam);
}

function decidirComUmaAvaliacao(avaliacao: AvaliacaoDeCuradora): DecisaoDoPortao {
  return {
    avaliadoPor: avaliacao.curador,
    consenso: 'SO_UMA_AVALIOU',
    qualidade: 'ABSORVE',
    confianca: 'NORMAL',
    correcao: avaliacao.houveCorrecao ? (avaliacao.correcao ?? null) : null,
    porqueDaCorrecao: avaliacao.houveCorrecao ? (avaliacao.porque ?? null) : null,
    notaDaDivergencia: null,
  };
}

function decidirComDuasAvaliacoes(
  primeira: AvaliacaoDeCuradora,
  segunda: AvaliacaoDeCuradora,
  asDuasConcordam?: boolean,
): DecisaoDoPortao {
  const nenhumaCorrigiu = !primeira.houveCorrecao && !segunda.houveCorrecao;

  if (nenhumaCorrigiu) {
    return {
      avaliadoPor: 'AMBAS',
      consenso: 'ACORDO',
      qualidade: 'ABSORVE',
      confianca: 'ALTA',
      correcao: null,
      porqueDaCorrecao: null,
      notaDaDivergencia: null,
    };
  }

  const apenasUmaCorrigiu = primeira.houveCorrecao !== segunda.houveCorrecao;

  if (apenasUmaCorrigiu) {
    // Uma achou a indicação boa, a outra não: isto é divergência, mesmo que
    // ninguém tenha usado a palavra.
    return registrarDivergencia(primeira, segunda);
  }

  if (asDuasConcordam === undefined) {
    throw new FeedbackAmbiguoError(
      'Sonia e Mirella corrigiram as duas. É a mesma leitura ou são leituras ' +
        'diferentes? Responda antes de gravar — não dá para adivinhar sem arriscar ' +
        'silenciar uma divergência.',
    );
  }

  if (!asDuasConcordam) {
    return registrarDivergencia(primeira, segunda);
  }

  return {
    avaliadoPor: 'AMBAS',
    consenso: 'ACORDO',
    qualidade: 'ABSORVE',
    confianca: 'ALTA',
    correcao: primeira.correcao ?? segunda.correcao ?? null,
    porqueDaCorrecao: juntarPorques(primeira, segunda),
    notaDaDivergencia: null,
  };
}

/**
 * Registra as duas leituras lado a lado, com atribuição, e não elege vencedor:
 * `correcao` fica nula de propósito (a CHECK constraint do banco confirma isso).
 */
function registrarDivergencia(
  primeira: AvaliacaoDeCuradora,
  segunda: AvaliacaoDeCuradora,
): DecisaoDoPortao {
  return {
    avaliadoPor: 'AMBAS',
    consenso: 'DIVERGENCIA',
    qualidade: 'REVISAR',
    confianca: null,
    correcao: null,
    porqueDaCorrecao: null,
    notaDaDivergencia: [descreverLeitura(primeira), descreverLeitura(segunda)].join('\n\n'),
  };
}

function descreverLeitura(avaliacao: AvaliacaoDeCuradora): string {
  if (!avaliacao.houveCorrecao) {
    return `${avaliacao.curador}: manteve a indicação como estava.`;
  }

  const correcao = avaliacao.correcao ?? '(correção não detalhada)';
  const porque = avaliacao.porque ?? '(porquê não detalhado)';

  return `${avaliacao.curador}: ${correcao}\nPorquê: ${porque}`;
}

function juntarPorques(primeira: AvaliacaoDeCuradora, segunda: AvaliacaoDeCuradora): string | null {
  const porques = [primeira, segunda]
    .filter((avaliacao) => avaliacao.houveCorrecao)
    .map((avaliacao) => `${avaliacao.curador}: ${avaliacao.porque ?? ''}`.trim());

  return porques.length > 0 ? porques.join('\n') : null;
}

/**
 * Correção sem justificativa é dado quase inútil — então não vira dado nenhum
 * até que a justificativa venha.
 */
function exigirPorque(avaliacao: AvaliacaoDeCuradora): void {
  if (!avaliacao.houveCorrecao) {
    return;
  }

  const correcao = avaliacao.correcao?.trim() ?? '';

  if (correcao.length === 0) {
    throw new FeedbackAmbiguoError(
      `${avaliacao.curador} marcou que há correção mas não disse qual. ` +
        'Qual seria a indicação no lugar?',
    );
  }

  const porque = avaliacao.porque?.trim() ?? '';

  if (porque.length === 0) {
    throw new FeedbackAmbiguoError(
      `Falta o porquê da correção de ${avaliacao.curador}. ` +
        'O que nesta indicação não servia para esta pessoa, neste momento?',
    );
  }

  if (porque.length < TAMANHO_MINIMO_DO_PORQUE || ehPorqueVazio(porque)) {
    throw new FeedbackAmbiguoError(
      `O porquê de ${avaliacao.curador} ("${porque}") não diz o que mudou de leitura. ` +
        'Um pouco mais: o que a pessoa precisava e esta indicação não dava?',
    );
  }
}

function ehPorqueVazio(porque: string): boolean {
  const normalizado = porque
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/gu, '')
    .trim();

  return PORQUES_VAZIOS.has(normalizado);
}
