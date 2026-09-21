import 'server-only';

import { z } from 'zod';

import { FilmNotFoundError } from '@/lib/app-error.util';

import { db } from '../db.service';
import { FIELDS_FOR_INDICADOR, projectFilm } from '../film-projection.util';

import type { FilmForIndicador } from '@/lib/film.type';

export const FilmDetailsInputSchema = z.object({
  film_id: z.uuid().describe('The identifier returned by search_films.'),
});

export type FilmDetailsInput = z.infer<typeof FilmDetailsInputSchema>;

/**
 * The full record of a film: the factual layer and the curators' study.
 *
 * @throws {FilmNotFoundError} when the id is not in the archive.
 */
export async function filmDetails(input: FilmDetailsInput): Promise<FilmForIndicador> {
  const film = await db.film.findUnique({
    where: { id: input.film_id },
    select: FIELDS_FOR_INDICADOR,
  });

  if (film === null) {
    throw new FilmNotFoundError(input.film_id);
  }

  return projectFilm(film);
}
