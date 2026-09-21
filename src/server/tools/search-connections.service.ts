import 'server-only';

import { z } from 'zod';

import { FilmNotFoundError } from '@/lib/app-error.util';

import { db } from '../db.service';

import type { ConnectionForIndicador } from '@/lib/film.type';

const DEFAULT_LIMIT = 20;

export const SearchConnectionsInputSchema = z.object({
  film_id: z.uuid().describe('Source film of the bridge.'),
  type: z
    .enum([
      'ENTRY_POINT',
      'IF_YOU_LIKED',
      'BEFORE_WATCHING',
      'RELEASE_TO_ARCHIVE',
      'ARCHIVE_TO_RELEASE',
      'OTHER',
    ])
    .optional()
    .describe('Narrows to one kind of bridge.'),
});

export type SearchConnectionsInput = z.infer<typeof SearchConnectionsInputSchema>;

/**
 * The bridges the curators built from a film, each one with its reason.
 *
 * This is the tool that makes the Method real: without it the Indicador
 * recommends by statistical similarity, which is exactly what the Method
 * rejects.
 *
 * @throws {FilmNotFoundError} when the source film does not exist.
 */
export async function searchConnections(
  input: SearchConnectionsInput,
): Promise<readonly ConnectionForIndicador[]> {
  const source = await db.film.findUnique({
    where: { id: input.film_id },
    select: { id: true },
  });

  if (source === null) {
    throw new FilmNotFoundError(input.film_id);
  }

  const connections = await db.connection.findMany({
    where: {
      sourceFilmId: input.film_id,
      ...(input.type !== undefined ? { type: input.type } : {}),
    },
    select: {
      id: true,
      type: true,
      bridgedBy: true,
      why: true,
      curator: true,
      targetFilm: { select: { id: true, title: true, year: true, director: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: DEFAULT_LIMIT,
  });

  return connections.map((connection) => ({
    connection_id: connection.id,
    type: connection.type,
    bridged_by: connection.bridgedBy,
    why: connection.why,
    curator: connection.curator,
    target_film: {
      film_id: connection.targetFilm.id,
      title: connection.targetFilm.title,
      year: connection.targetFilm.year,
      director: connection.targetFilm.director,
    },
  }));
}
