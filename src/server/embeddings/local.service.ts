import 'server-only';

import type { ProviderDeEmbeddings } from './embeddings.service';

const DIMENSOES = 1024;
const TAMANHO_MINIMO_DO_TOKEN = 3;

/**
 * Fallback determinístico, sem rede: projeção com sinal de unigramas e bigramas
 * num espaço de 1024 dimensões, normalizada em L2.
 *
 * Serve para o projeto subir e ser demonstrável sem nenhuma chave de API. Ele
 * aproxima sobreposição de vocabulário, não significado — é o oposto do que o
 * Método pede da busca ("por tom/tema, não por palavra-chave"). Nunca use para
 * indexar o acervo real; troque `EMBEDDINGS_PROVIDER` antes disso.
 */
export function criarProviderLocal(): ProviderDeEmbeddings {
  return {
    nome: 'local',
    modelo: 'hash-projection-1024',
    dimensoes: DIMENSOES,
    gerar(textos) {
      return Promise.resolve(textos.map((texto) => projetar(tokenizar(texto))));
    },
  };
}

function tokenizar(texto: string): readonly string[] {
  return texto
    .normalize('NFD')
    // Remove os diacríticos separados pelo NFD (bloco Combining Diacritical Marks).
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= TAMANHO_MINIMO_DO_TOKEN);
}

function projetar(tokens: readonly string[]): readonly number[] {
  const vetor = new Array<number>(DIMENSOES).fill(0);

  for (const [posicao, token] of tokens.entries()) {
    acumular(vetor, token, 1);

    const seguinte = tokens[posicao + 1];

    if (seguinte !== undefined) {
      // Bigrama pesa menos que o termo isolado, mas captura alguma ordem.
      acumular(vetor, `${token}_${seguinte}`, 0.5);
    }
  }

  return normalizar(vetor);
}

function acumular(vetor: number[], termo: string, peso: number): void {
  const hash = fnv1a(termo);
  const indice = hash % DIMENSOES;
  const sinal = hash >>> 31 === 0 ? 1 : -1;

  vetor[indice] = (vetor[indice] ?? 0) + sinal * peso;
}

function normalizar(vetor: readonly number[]): readonly number[] {
  const norma = Math.sqrt(vetor.reduce((soma, valor) => soma + valor * valor, 0));

  if (norma === 0) {
    return vetor;
  }

  return vetor.map((valor) => valor / norma);
}

/** FNV-1a de 32 bits — barato, determinístico e estável entre processos. */
function fnv1a(texto: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}
