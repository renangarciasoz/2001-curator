import 'server-only';

import { z } from 'zod';

import { db } from '../db.service';
import { fetchListingFromTmdb } from '../tmdb.service';

import type { ScheduledFilm } from '../tmdb.service';

/** Brazil: the store is in São Paulo and so is everyone asking. */
const DEFAULT_REGION = 'BR';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 20;

export const SearchReleasesInputSchema = z.object({
  listing: z
    .enum(['now_playing', 'upcoming'])
    .describe('`now_playing` for what is in cinemas today; `upcoming` for what opens next.'),
  region: z
    .string()
    .length(2)
    .optional()
    .describe('ISO 3166-1 country code. Defaults to BR — ask only if the person is elsewhere.'),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
});

export type SearchReleasesInput = z.infer<typeof SearchReleasesInputSchema>;

/**
 * A film on the cinema listing, plus whether the 2001 archive knows it.
 *
 * The two layers stay labelled apart, which is the whole reason this tool
 * returns a shape of its own instead of the archive's. Everything from TMDB is
 * third-party lookup; `in_2001_archive` and `film_id` are the only bridge back
 * to what the curators have actually studied.
 */
export type ScheduledFilmForIndicador = {
  readonly title: string;
  readonly original_title: string | null;
  readonly release_date: string | null;
  readonly synopsis_from_tmdb: string | null;
  readonly audience_score_from_tmdb: number | null;
  /** True when this film is in the archive — then `film_details` has the study. */
  readonly in_2001_archive: boolean;
  readonly film_id: string | null;
  readonly has_2001_curation: boolean;
};

/**
 * What is showing in cinemas, or about to open.
 *
 * This is the one tool that does not read the archive, and the only one whose
 * content is entirely third party. Nothing it returns is written anywhere: "in
 * cinemas" is true for a week, and a listing cached in the database would be a
 * lie with a timestamp on it.
 *
 * It does cross the listing against the archive, because that is where the
 * curation is. A film the curators have studied comes back with its `film_id`,
 * so the Indicador can call `film_details` and speak about it in the archive's
 * own words instead of TMDB's synopsis.
 *
 * @throws {ProviderUnavailableError} when TMDB has no credential or does not answer.
 */
export async function searchReleases(
  input: SearchReleasesInput,
  signal?: AbortSignal,
): Promise<readonly ScheduledFilmForIndicador[]> {
  const listing = await fetchListingFromTmdb(
    input.listing,
    input.region ?? DEFAULT_REGION,
    input.limit ?? DEFAULT_LIMIT,
    signal,
  );

  return attachArchive(listing);
}

async function attachArchive(
  listing: readonly ScheduledFilm[],
): Promise<readonly ScheduledFilmForIndicador[]> {
  if (listing.length === 0) {
    return [];
  }

  const known = await db.film.findMany({
    where: { tmdbId: { in: listing.map((film) => film.tmdbId) } },
    select: { id: true, tmdbId: true, curatorialSource: true },
  });

  const byTmdbId = new Map(known.map((film) => [film.tmdbId, film]));

  return listing.map((film) => {
    const archived = byTmdbId.get(film.tmdbId);

    return {
      title: film.title,
      original_title: film.originalTitle,
      release_date: film.releaseDate,
      synopsis_from_tmdb: film.synopsis,
      audience_score_from_tmdb: film.audienceScore,
      in_2001_archive: archived !== undefined,
      film_id: archived?.id ?? null,
      has_2001_curation: archived?.curatorialSource === 'CURATION_2001',
    };
  });
}
