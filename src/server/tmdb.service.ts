import 'server-only';

import { z } from 'zod';

import { ProviderUnavailableError } from '@/lib/app-error.util';

import { env } from './env.config';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

/**
 * The factual record of a film — the third-party bucket.
 *
 * This is lookup, never training material. The 2001 curatorial layer lives in
 * separate columns of `film`, and the dataset exporter never reads these fields.
 */
export type FactualFilm = {
  tmdbId: number | null;
  title: string;
  originalTitle: string | null;
  year: number | null;
  director: string | null;
  country: string | null;
  factualSynopsis: string | null;
  posterPath: string | null;
};

/** TMDB response: external content, therefore validated before it enters the domain. */
const TmdbFilmSchema = z.object({
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

const TmdbSearchSchema = z.object({
  results: z.array(z.object({ id: z.number().int(), title: z.string() })).default([]),
});

/** Is there a TMDB credential in this environment? The caller decides the fallback. */
export function hasTmdbCredential(): boolean {
  return env.TMDB_ACCESS_TOKEN.length > 0;
}

/**
 * Fetches the factual record of a film from TMDB.
 *
 * @throws {ProviderUnavailableError} when there is no credential, the network
 *   fails, or the response does not have the expected shape.
 */
export async function fetchFilmFromTmdb(
  tmdbId: number,
  signal?: AbortSignal,
): Promise<FactualFilm> {
  const url = new URL(`${TMDB_BASE_URL}/movie/${String(tmdbId)}`);
  url.searchParams.set('language', env.TMDB_LANGUAGE);
  url.searchParams.set('append_to_response', 'credits');

  const raw = await requestTmdb(url, signal);
  const result = TmdbFilmSchema.safeParse(raw);

  if (!result.success) {
    throw new ProviderUnavailableError(
      'TMDB',
      `unexpected response for film ${String(tmdbId)}`,
    );
  }

  return normalize(result.data);
}

/**
 * Searches films by title and returns TMDB ids, most to least relevant.
 *
 * @throws {ProviderUnavailableError} under the same conditions as `fetchFilmFromTmdb`.
 */
export async function searchTmdbIds(
  title: string,
  signal?: AbortSignal,
): Promise<readonly number[]> {
  const url = new URL(`${TMDB_BASE_URL}/search/movie`);
  url.searchParams.set('query', title);
  url.searchParams.set('language', env.TMDB_LANGUAGE);

  const raw = await requestTmdb(url, signal);
  const result = TmdbSearchSchema.safeParse(raw);

  if (!result.success) {
    throw new ProviderUnavailableError('TMDB', `unexpected response searching for "${title}"`);
  }

  return result.data.results.map((film) => film.id);
}

async function requestTmdb(url: URL, signal?: AbortSignal): Promise<unknown> {
  if (!hasTmdbCredential()) {
    throw new ProviderUnavailableError('TMDB', 'TMDB_ACCESS_TOKEN is not configured');
  }

  let response: Response;

  try {
    response = await fetch(url, {
      // A technical record is a live factual lookup: never served from Next's cache.
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${env.TMDB_ACCESS_TOKEN}`,
        Accept: 'application/json',
      },
      signal: signal ?? null,
    });
  } catch (e) {
    throw new ProviderUnavailableError('TMDB', 'network failure', { cause: e });
  }

  if (!response.ok) {
    throw new ProviderUnavailableError('TMDB', `HTTP ${String(response.status)}`);
  }

  return response.json();
}

function normalize(film: z.infer<typeof TmdbFilmSchema>): FactualFilm {
  const director = film.credits?.crew.find((member) => member.job === 'Director')?.name ?? null;

  const country = film.production_countries[0]?.name ?? film.origin_country[0] ?? null;

  return {
    tmdbId: film.id,
    title: film.title,
    originalTitle: film.original_title.length > 0 ? film.original_title : null,
    year: extractYear(film.release_date),
    director,
    country,
    factualSynopsis: film.overview.length > 0 ? film.overview : null,
    posterPath: film.poster_path,
  };
}

function extractYear(releaseDate: string): number | null {
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);

  return Number.isNaN(year) ? null : year;
}
