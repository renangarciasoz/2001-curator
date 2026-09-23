import 'server-only';

import { QdrantClient } from '@qdrant/js-client-rest';

import { AppError, ProviderUnavailableError, describeError } from '@/lib/app-error.util';

import { env } from './env.config';

/** What lives in Qdrant besides the vector: only enough to filter before the database. */
export type FilmPayload = {
  title: string;
  year: number | null;
  archive_category: string | null;
  commercial_register: string | null;
  emotional_tone: string | null;
  /** Which provider produced this vector. Vectors from different providers do not compare. */
  provider: string;
  model: string;
};

export type FilmPoint = {
  filmId: string;
  vector: readonly number[];
  payload: FilmPayload;
};

export type SearchFilter = {
  archiveCategory?: string;
  commercialRegister?: string;
  minYear?: number;
  maxYear?: number;
};

export type SearchCandidate = {
  filmId: string;
  closeness: number;
};

/** The existing index and the currently configured provider disagree. */
export class IncompatibleIndexError extends AppError {
  constructor(detail: string) {
    super('incompatible_index', detail);
  }
}

let cachedClient: QdrantClient | null = null;

function client(): QdrantClient {
  cachedClient ??= new QdrantClient(
    env.QDRANT_API_KEY.length > 0
      ? { url: env.QDRANT_URL, apiKey: env.QDRANT_API_KEY }
      : { url: env.QDRANT_URL },
  );

  return cachedClient;
}

/**
 * Ensures the collection exists with this provider's vector size.
 *
 * If it already exists with a different size, this fails rather than
 * re-creating it: silently dropping the archive index in the middle of a
 * provider switch is worse than stopping. Deliberate re-indexing is
 * `pnpm index:embeddings -- --recreate`.
 *
 * @throws {IncompatibleIndexError} when the vector size does not match.
 */
export async function ensureCollection(dimensions: number, recreate = false): Promise<void> {
  const name = env.QDRANT_COLLECTION;
  const existing = await describeCollection(name);

  if (existing !== null && recreate) {
    await client().deleteCollection(name);
  }

  if (existing !== null && !recreate) {
    if (existing.dimensions !== dimensions) {
      throw new IncompatibleIndexError(
        `collection "${name}" was created with ${String(existing.dimensions)}-dimension vectors ` +
          `and the current provider produces ${String(dimensions)}. ` +
          'Run `pnpm index:embeddings -- --recreate` to rebuild the archive index.',
      );
    }

    return;
  }

  try {
    await client().createCollection(name, {
      vectors: { size: dimensions, distance: 'Cosine' },
    });
  } catch (e) {
    throw new ProviderUnavailableError('qdrant', `could not create "${name}"`, { cause: e });
  }
}

/** Writes (or rewrites) the vectors of a batch of films. */
export async function indexFilms(points: readonly FilmPoint[]): Promise<void> {
  if (points.length === 0) {
    return;
  }

  try {
    await client().upsert(env.QDRANT_COLLECTION, {
      wait: true,
      points: points.map((point) => ({
        id: point.filmId,
        vector: [...point.vector],
        payload: { ...point.payload },
      })),
    });
  } catch (e) {
    throw new ProviderUnavailableError('qdrant', `indexing failed: ${describeError(e)}`, {
      cause: e,
    });
  }
}

/**
 * Searches by closeness of meaning and returns ids only.
 *
 * Curatorial metadata comes from Postgres afterwards, not from the payload: the
 * database is the source of truth, and a stale payload would make the AI justify
 * a recommendation with the wrong study.
 */
export async function searchByVector(
  vector: readonly number[],
  limit: number,
  filter?: SearchFilter,
): Promise<readonly SearchCandidate[]> {
  const conditions = buildConditions(filter);

  try {
    const response = await client().query(env.QDRANT_COLLECTION, {
      query: [...vector],
      limit,
      with_payload: false,
      ...(conditions.length > 0 ? { filter: { must: conditions } } : {}),
    });

    return response.points.map((point) => ({
      filmId: String(point.id),
      closeness: point.score,
    }));
  } catch (e) {
    throw new ProviderUnavailableError('qdrant', `search failed: ${describeError(e)}`, {
      cause: e,
    });
  }
}

export type CollectionStatus = {
  readonly dimensions: number;
  readonly points: number;
};

/**
 * The collection's size and fill, or `null` when it does not exist.
 *
 * Unlike `describeCollection`, an unreachable server throws here instead of
 * coming back as `null`. The distinction is the whole point for a diagnostic:
 * "the collection is missing" is fixed by re-indexing, "the server is down" is
 * fixed by starting a container, and reporting the second as the first sends
 * the operator to re-index against nothing.
 *
 * @throws {ProviderUnavailableError} when Qdrant cannot be reached.
 */
export async function collectionStatus(name: string): Promise<CollectionStatus | null> {
  let info: Awaited<ReturnType<QdrantClient['getCollections']>>;

  try {
    info = await client().getCollections();
  } catch (e) {
    throw new ProviderUnavailableError('qdrant', describeError(e), { cause: e });
  }

  if (!info.collections.some((collection) => collection.name === name)) {
    return null;
  }

  const described = await describeCollection(name);

  if (described === null) {
    return null;
  }

  const counted = await client().count(name, { exact: true });

  return { dimensions: described.dimensions, points: counted.count };
}

/**
 * The collection's vector size, or `null` if it does not exist.
 *
 * The response's `vectors` field can be a single set of parameters or a map of
 * named vectors. This collection uses the simple form; rather than depending on
 * the exact shape of the client's type, the read is defensive.
 */
async function describeCollection(name: string): Promise<{ dimensions: number } | null> {
  try {
    const info = await client().getCollection(name);
    const vectors: unknown = info.config.params.vectors;

    if (typeof vectors !== 'object' || vectors === null) {
      return null;
    }

    const size: unknown = Reflect.get(vectors, 'size');

    return typeof size === 'number' ? { dimensions: size } : null;
  } catch {
    // The client throws when the collection does not exist; absence is not an error here.
    return null;
  }
}

function buildConditions(filter?: SearchFilter) {
  if (filter === undefined) {
    return [];
  }

  const candidates = [
    filter.archiveCategory !== undefined
      ? { key: 'archive_category', match: { value: filter.archiveCategory } }
      : null,
    filter.commercialRegister !== undefined
      ? { key: 'commercial_register', match: { value: filter.commercialRegister } }
      : null,
    filter.minYear !== undefined || filter.maxYear !== undefined
      ? {
          key: 'year',
          range: {
            ...(filter.minYear !== undefined ? { gte: filter.minYear } : {}),
            ...(filter.maxYear !== undefined ? { lte: filter.maxYear } : {}),
          },
        }
      : null,
  ];

  return candidates.filter((condition) => condition !== null);
}
