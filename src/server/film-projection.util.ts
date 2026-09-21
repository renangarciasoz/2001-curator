import 'server-only';

import type { FilmForIndicador } from '@/lib/film.type';
import type { Prisma } from '@prisma/client';

/**
 * The fields the Indicador is allowed to see. Declared once and reused by every
 * tool, so no query accidentally widens what leaves the database.
 */
export const FIELDS_FOR_INDICADOR = {
  id: true,
  title: true,
  originalTitle: true,
  year: true,
  director: true,
  country: true,
  factualSynopsis: true,
  factualSource: true,
  emotionalTone: true,
  whatItProvokes: true,
  commercialRegister: true,
  archiveCategory: true,
  curatorialNotes: true,
  historicalContext: true,
  reviewedBy: true,
  curatorialSource: true,
} as const satisfies Prisma.FilmSelect;

export type SelectedFilm = Prisma.FilmGetPayload<{
  select: typeof FIELDS_FOR_INDICADOR;
}>;

/** Converts the Postgres row into the shape that crosses the boundary. */
export function projectFilm(film: SelectedFilm): FilmForIndicador {
  return {
    film_id: film.id,

    title: film.title,
    original_title: film.originalTitle,
    year: film.year,
    director: film.director,
    country: film.country,
    factual_synopsis: film.factualSynopsis,
    factual_source: film.factualSource,

    emotional_tone: film.emotionalTone,
    what_it_provokes: film.whatItProvokes,
    commercial_register: film.commercialRegister,
    archive_category: film.archiveCategory,
    curatorial_notes: film.curatorialNotes,
    historical_context: film.historicalContext,
    reviewed_by: film.reviewedBy,
    curatorial_source: film.curatorialSource,
    has_2001_curation: film.curatorialSource === 'CURATION_2001',
  };
}
