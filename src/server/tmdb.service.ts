import 'server-only';

import { z } from 'zod';

import { ProviderIndisponivelError } from '@/lib/app-error.util';

import { env } from './env.config';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

/**
 * Ficha factual de um filme — o balde de terceiros.
 *
 * Isto é consulta, nunca material de treino. A camada curatorial da 2001 vive
 * em colunas separadas de `filme` e o exportador de dataset jamais lê estes campos.
 */
export type FilmeFactual = {
  tmdbId: number | null;
  titulo: string;
  tituloOriginal: string | null;
  ano: number | null;
  diretor: string | null;
  pais: string | null;
  sinopseFactual: string | null;
  posterPath: string | null;
};

/** Resposta do TMDB: conteúdo externo, portanto validado antes de entrar no domínio. */
const TmdbFilmeSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  original_title: z.string().default(''),
  release_date: z.string().default(''),
  overview: z.string().default(''),
  poster_path: z.string().nullable().default(null),
  production_countries: z
    .array(z.object({ iso_3166_1: z.string(), name: z.string() }))
    .default([]),
  origin_country: z.array(z.string()).default([]),
  credits: z
    .object({
      crew: z.array(z.object({ job: z.string(), name: z.string() })).default([]),
    })
    .optional(),
});

const TmdbBuscaSchema = z.object({
  results: z.array(z.object({ id: z.number().int(), title: z.string() })).default([]),
});

/** Há credencial do TMDB neste ambiente? Quem chama decide o fallback. */
export function temCredencialTmdb(): boolean {
  return env.TMDB_ACCESS_TOKEN.length > 0;
}

/**
 * Busca a ficha factual de um filme no TMDB.
 *
 * @throws {ProviderIndisponivelError} quando não há credencial, a rede falha, ou
 *   a resposta não tem o formato esperado.
 */
export async function buscarFilmeNoTmdb(
  tmdbId: number,
  signal?: AbortSignal,
): Promise<FilmeFactual> {
  const url = new URL(`${TMDB_BASE_URL}/movie/${String(tmdbId)}`);
  url.searchParams.set('language', env.TMDB_LANGUAGE);
  url.searchParams.set('append_to_response', 'credits');

  const cru = await requisitarTmdb(url, signal);
  const resultado = TmdbFilmeSchema.safeParse(cru);

  if (!resultado.success) {
    throw new ProviderIndisponivelError(
      'TMDB',
      `resposta inesperada para o filme ${String(tmdbId)}`,
    );
  }

  return normalizar(resultado.data);
}

/**
 * Procura filmes por título e devolve os ids do TMDB, do mais ao menos relevante.
 *
 * @throws {ProviderIndisponivelError} nas mesmas condições de `buscarFilmeNoTmdb`.
 */
export async function procurarIdsNoTmdb(
  titulo: string,
  signal?: AbortSignal,
): Promise<readonly number[]> {
  const url = new URL(`${TMDB_BASE_URL}/search/movie`);
  url.searchParams.set('query', titulo);
  url.searchParams.set('language', env.TMDB_LANGUAGE);

  const cru = await requisitarTmdb(url, signal);
  const resultado = TmdbBuscaSchema.safeParse(cru);

  if (!resultado.success) {
    throw new ProviderIndisponivelError('TMDB', `resposta inesperada ao procurar "${titulo}"`);
  }

  return resultado.data.results.map((filme) => filme.id);
}

async function requisitarTmdb(url: URL, signal?: AbortSignal): Promise<unknown> {
  if (!temCredencialTmdb()) {
    throw new ProviderIndisponivelError('TMDB', 'TMDB_ACCESS_TOKEN não configurado');
  }

  let resposta: Response;

  try {
    resposta = await fetch(url, {
      // Ficha técnica é consulta factual ao vivo: nunca servida de cache do Next.
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${env.TMDB_ACCESS_TOKEN}`,
        Accept: 'application/json',
      },
      signal: signal ?? null,
    });
  } catch (e) {
    throw new ProviderIndisponivelError('TMDB', 'falha de rede', { cause: e });
  }

  if (!resposta.ok) {
    throw new ProviderIndisponivelError('TMDB', `HTTP ${String(resposta.status)}`);
  }

  return resposta.json();
}

function normalizar(filme: z.infer<typeof TmdbFilmeSchema>): FilmeFactual {
  const diretor = filme.credits?.crew.find((membro) => membro.job === 'Director')?.name ?? null;

  const pais = filme.production_countries[0]?.name ?? filme.origin_country[0] ?? null;

  const ano = extrairAno(filme.release_date);

  return {
    tmdbId: filme.id,
    titulo: filme.title,
    tituloOriginal: filme.original_title.length > 0 ? filme.original_title : null,
    ano,
    diretor,
    pais,
    sinopseFactual: filme.overview.length > 0 ? filme.overview : null,
    posterPath: filme.poster_path,
  };
}

function extrairAno(releaseDate: string): number | null {
  const ano = Number.parseInt(releaseDate.slice(0, 4), 10);

  return Number.isNaN(ano) ? null : ano;
}
