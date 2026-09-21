import 'server-only';

import { z } from 'zod';

import { db } from '../db.service';
import { getEmbeddingsProvider } from '../embeddings/embeddings.service';
import { FIELDS_FOR_INDICADOR, projectFilm } from '../film-projection.util';
import { searchByVector } from '../qdrant.service';

import type { FilmCandidateForIndicador } from '@/lib/film.type';
import type { SearchFilter } from '../qdrant.service';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 20;

export const SearchFilmsInputSchema = z.object({
  criteria: z
    .string()
    .min(3)
    .describe('What is being looked for: tone, theme, what the person needs to feel.'),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  commercial_register: z.enum(['COMMERCIAL', 'ARTHOUSE', 'BOTH']).optional(),
  archive_category: z.string().optional(),
  min_year: z.number().int().optional(),
  max_year: z.number().int().optional(),
});

export type SearchFilmsInput = z.infer<typeof SearchFilmsInputSchema>;

/**
 * Searches the archive by closeness of meaning, not by keyword.
 *
 * The criteria become a vector through the same provider that indexed the
 * archive, and Qdrant returns the neighbours. Metadata comes from Postgres in a
 * second step, so the Indicador justifies a recommendation with the curators'
 * current study.
 */
export async function searchFilms(
  input: SearchFilmsInput,
  signal?: AbortSignal,
): Promise<readonly FilmCandidateForIndicador[]> {
  const provider = getEmbeddingsProvider();
  const [vector] = await provider.generate([input.criteria], 'query', signal);

  if (vector === undefined) {
    return [];
  }

  const candidates = await searchByVector(
    vector,
    input.limit ?? DEFAULT_LIMIT,
    buildFilter(input),
  );

  if (candidates.length === 0) {
    return [];
  }

  const films = await db.film.findMany({
    where: { id: { in: candidates.map((candidate) => candidate.filmId) } },
    select: FIELDS_FOR_INDICADOR,
  });

  const byId = new Map(films.map((film) => [film.id, film]));

  // The order is Qdrant's: that is what carries the semantic closeness.
  return candidates.flatMap((candidate) => {
    const film = byId.get(candidate.filmId);

    if (film === undefined) {
      // The point outlived a film deleted from the database. Skipping is right here.
      return [];
    }

    return [{ ...projectFilm(film), closeness: candidate.closeness }];
  });
}

function buildFilter(input: SearchFilmsInput): SearchFilter | undefined {
  const filter: SearchFilter = {
    ...(input.archive_category !== undefined ? { archiveCategory: input.archive_category } : {}),
    ...(input.commercial_register !== undefined
      ? { commercialRegister: input.commercial_register }
      : {}),
    ...(input.min_year !== undefined ? { minYear: input.min_year } : {}),
    ...(input.max_year !== undefined ? { maxYear: input.max_year } : {}),
  };

  return Object.keys(filter).length > 0 ? filter : undefined;
}
