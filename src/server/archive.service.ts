import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { ProviderUnavailableError } from '@/lib/app-error.util';

import { db } from './db.service';

import type { FactualSource } from '@prisma/client';
import type { FactualFilm } from './tmdb.service';

const FIXTURE_PATH = path.join('data', 'films-fixture.json');

const FixtureSchema = z.object({
  films: z.array(
    z.object({
      title: z.string().min(1),
      originalTitle: z.string().nullable().default(null),
      year: z.number().int().nullable().default(null),
      director: z.string().nullable().default(null),
      country: z.string().nullable().default(null),
      factualSynopsis: z.string().nullable().default(null),
    }),
  ),
});

export type IngestionResult = {
  filmId: string;
  title: string;
  created: boolean;
};

/**
 * Writes the factual record of a film without touching the curatorial layer.
 *
 * That separation is the reason this function exists: ingestion can run again
 * against TMDB at any time, and the curators' study — emotional tone, what the
 * film provokes, notes, context — is never overwritten by third-party data.
 */
export async function saveFactualLayer(
  film: FactualFilm,
  source: FactualSource,
): Promise<IngestionResult> {
  const factualLayer = {
    title: film.title,
    originalTitle: film.originalTitle,
    year: film.year,
    director: film.director,
    country: film.country,
    factualSynopsis: film.factualSynopsis,
    posterPath: film.posterPath,
    factualSource: source,
  };

  const existing = await findFilm(film);

  if (existing !== null) {
    const updated = await db.film.update({
      where: { id: existing.id },
      // The factual record changed, so the indexed vector is stale.
      data: { ...factualLayer, indexedAt: null },
      select: { id: true, title: true },
    });

    return { filmId: updated.id, title: updated.title, created: false };
  }

  const created = await db.film.create({
    data: { ...factualLayer, tmdbId: film.tmdbId },
    select: { id: true, title: true },
  });

  return { filmId: created.id, title: created.title, created: true };
}

/**
 * Reads the development records from `data/films-fixture.json`.
 *
 * It exists so the project runs without a TMDB credential. The content is
 * hand-written and lands in the database marked DEV_FIXTURE — it never poses
 * as TMDB data.
 *
 * @throws {ProviderUnavailableError} if the file is missing or malformed.
 */
export async function loadFilmFixture(): Promise<readonly FactualFilm[]> {
  const fullPath = path.resolve(process.cwd(), FIXTURE_PATH);

  let raw: unknown;

  try {
    raw = JSON.parse(await readFile(fullPath, 'utf8'));
  } catch (e) {
    throw new ProviderUnavailableError('fixture', `could not read ${fullPath}`, { cause: e });
  }

  const result = FixtureSchema.safeParse(raw);

  if (!result.success) {
    throw new ProviderUnavailableError('fixture', `${fullPath} is not in the expected format`);
  }

  return result.data.films.map((film) => ({
    tmdbId: null,
    title: film.title,
    originalTitle: film.originalTitle,
    year: film.year,
    director: film.director,
    country: film.country,
    factualSynopsis: film.factualSynopsis,
    posterPath: null,
  }));
}

/**
 * Locates an already-stored film: by TMDB id when there is one, otherwise by
 * title + year, which is how fixture records identify themselves.
 */
async function findFilm(film: FactualFilm): Promise<{ id: string } | null> {
  if (film.tmdbId !== null) {
    return db.film.findUnique({ where: { tmdbId: film.tmdbId }, select: { id: true } });
  }

  return db.film.findFirst({
    where: { title: film.title, year: film.year },
    select: { id: true },
  });
}
