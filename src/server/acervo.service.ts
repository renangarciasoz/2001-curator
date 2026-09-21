import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { ProviderIndisponivelError } from '@/lib/app-error.util';

import { db } from './db.service';

import type { FonteFactual } from '@prisma/client';
import type { FilmeFactual } from './tmdb.service';

const CAMINHO_DO_FIXTURE = path.join('data', 'filmes-fixture.json');

const FixtureSchema = z.object({
  filmes: z.array(
    z.object({
      titulo: z.string().min(1),
      tituloOriginal: z.string().nullable().default(null),
      ano: z.number().int().nullable().default(null),
      diretor: z.string().nullable().default(null),
      pais: z.string().nullable().default(null),
      sinopseFactual: z.string().nullable().default(null),
    }),
  ),
});

export type ResultadoDaIngestao = {
  filmeId: string;
  titulo: string;
  criado: boolean;
};

/**
 * Grava a ficha factual de um filme sem tocar na camada curatorial.
 *
 * Esta separação é a razão de a função existir: a ingestão pode rodar de novo a
 * qualquer momento contra o TMDB, e o estudo das curadoras — tom emocional, o
 * que provoca, notas, contexto — nunca é sobrescrito por dado de terceiros.
 */
export async function salvarCamadaFactual(
  filme: FilmeFactual,
  fonte: FonteFactual,
): Promise<ResultadoDaIngestao> {
  const camadaFactual = {
    titulo: filme.titulo,
    tituloOriginal: filme.tituloOriginal,
    ano: filme.ano,
    diretor: filme.diretor,
    pais: filme.pais,
    sinopseFactual: filme.sinopseFactual,
    posterPath: filme.posterPath,
    fonteFactual: fonte,
  };

  const existente = await encontrarFilme(filme);

  if (existente !== null) {
    const atualizado = await db.filme.update({
      where: { id: existente.id },
      // A ficha factual mudou, então o vetor indexado está velho.
      data: { ...camadaFactual, indexadoEm: null },
      select: { id: true, titulo: true },
    });

    return { filmeId: atualizado.id, titulo: atualizado.titulo, criado: false };
  }

  const criado = await db.filme.create({
    data: { ...camadaFactual, tmdbId: filme.tmdbId },
    select: { id: true, titulo: true },
  });

  return { filmeId: criado.id, titulo: criado.titulo, criado: true };
}

/**
 * Lê as fichas de desenvolvimento de `data/filmes-fixture.json`.
 *
 * Existe para que o projeto rode sem credencial do TMDB. O conteúdo é escrito à
 * mão e entra no banco marcado como FIXTURE_DEV — nunca se passa por TMDB.
 *
 * @throws {ProviderIndisponivelError} se o arquivo faltar ou estiver malformado.
 */
export async function carregarFixtureDeFilmes(): Promise<readonly FilmeFactual[]> {
  const caminho = path.resolve(process.cwd(), CAMINHO_DO_FIXTURE);

  let cru: unknown;

  try {
    cru = JSON.parse(await readFile(caminho, 'utf8'));
  } catch (e) {
    throw new ProviderIndisponivelError('fixture', `não foi possível ler ${caminho}`, {
      cause: e,
    });
  }

  const resultado = FixtureSchema.safeParse(cru);

  if (!resultado.success) {
    throw new ProviderIndisponivelError('fixture', `${caminho} não tem o formato esperado`);
  }

  return resultado.data.filmes.map((filme) => ({
    tmdbId: null,
    titulo: filme.titulo,
    tituloOriginal: filme.tituloOriginal,
    ano: filme.ano,
    diretor: filme.diretor,
    pais: filme.pais,
    sinopseFactual: filme.sinopseFactual,
    posterPath: null,
  }));
}

/**
 * Localiza um filme já gravado: pelo id do TMDB quando há um, senão pela dupla
 * título + ano, que é como as fichas de fixture se identificam.
 */
async function encontrarFilme(filme: FilmeFactual): Promise<{ id: string } | null> {
  if (filme.tmdbId !== null) {
    return db.filme.findUnique({ where: { tmdbId: filme.tmdbId }, select: { id: true } });
  }

  return db.filme.findFirst({
    where: { titulo: filme.titulo, ano: filme.ano },
    select: { id: true },
  });
}
