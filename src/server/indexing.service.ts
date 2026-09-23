import 'server-only';

import { db } from './db.service';
import { getEmbeddingsProvider } from './embeddings/embeddings.service';
import { env } from './env.config';
import { collectionStatus, ensureCollection, indexFilms } from './qdrant.service';

import type { EmbeddingsProvider } from './embeddings/embeddings.service';
import type { FilmPoint } from './qdrant.service';

const BATCH_SIZE = 32;

/** The fields the index needs — nothing else leaves the database. */
const INDEXABLE_FIELDS = {
  id: true,
  title: true,
  originalTitle: true,
  year: true,
  director: true,
  country: true,
  factualSynopsis: true,
  emotionalTone: true,
  whatItProvokes: true,
  commercialRegister: true,
  curatorialNotes: true,
  historicalContext: true,
  archiveCategory: true,
} as const;

type IndexableFilm = {
  id: string;
  title: string;
  originalTitle: string | null;
  year: number | null;
  director: string | null;
  country: string | null;
  factualSynopsis: string | null;
  emotionalTone: string | null;
  whatItProvokes: string | null;
  commercialRegister: string | null;
  curatorialNotes: string | null;
  historicalContext: string | null;
  archiveCategory: string | null;
};

export type IndexingResult = {
  provider: string;
  model: string;
  dimensions: number;
  indexed: number;
};

/**
 * Builds the text that represents a film in meaning-based search.
 *
 * The curatorial layer comes first and with explicit labels: it is what carries
 * tone, provocation and context, and it is what the Method searches by. The
 * factual record follows, as an identity anchor (title, director, period).
 *
 * The labels are Portuguese because the curatorial content and the queries are
 * Portuguese — an embedding model reads them as text, and mixing languages
 * inside one indexed document degrades retrieval.
 *
 * This text feeds the lookup index, not the Phase 2 dataset — which is why it
 * may mix the two buckets. The exporter never goes through here.
 */
export function buildEmbeddingText(film: IndexableFilm): string {
  const lines = [
    `Título: ${film.title}`,
    film.originalTitle !== null ? `Título original: ${film.originalTitle}` : null,
    film.director !== null ? `Direção: ${film.director}` : null,
    film.year !== null ? `Ano: ${String(film.year)}` : null,
    film.country !== null ? `País: ${film.country}` : null,
    film.emotionalTone !== null ? `Tom emocional: ${film.emotionalTone}` : null,
    film.whatItProvokes !== null ? `O que provoca no espectador: ${film.whatItProvokes}` : null,
    film.commercialRegister !== null ? `Registro: ${film.commercialRegister}` : null,
    film.archiveCategory !== null ? `Categoria do acervo: ${film.archiveCategory}` : null,
    film.historicalContext !== null ? `Contexto histórico: ${film.historicalContext}` : null,
    film.curatorialNotes !== null ? `Notas de curadoria: ${film.curatorialNotes}` : null,
    film.factualSynopsis !== null ? `Sinopse: ${film.factualSynopsis}` : null,
  ];

  return lines.filter((line) => line !== null).join('\n');
}

/**
 * Generates and stores the archive's vectors in Qdrant.
 *
 * By default it indexes only what is pending (`indexed_at` null), which is the
 * state ingestion and curatorial edits leave a film in.
 *
 * That default is only safe while Postgres and Qdrant agree, and `indexed_at`
 * cannot tell whether they do: it records *that* a film was indexed, never into
 * which cluster or collection. Three ordinary things break the agreement —
 * pointing the app at a second Qdrant, a run that died partway (a rate limit
 * is enough), a collection dropped by hand — and all three leave every film
 * claiming to be indexed against a collection holding fewer vectors than that.
 * Indexing "only what is pending" then reports `0 films indexed`, looks like a
 * success, and the first search finds nothing.
 *
 * So the index is asked what it actually holds, and a shortfall forces a full
 * pass. Counting is one cheap call, and it is the only thing that makes this
 * function idempotent in the way its callers already assume it is.
 */
export async function indexArchive(
  options: { readonly recreate?: boolean; readonly all?: boolean } = {},
): Promise<IndexingResult> {
  const provider = getEmbeddingsProvider();

  const { created } = await ensureCollection(provider.dimensions, options.recreate ?? false);

  const reindexAll =
    created || (await indexIsBehind()) || (options.all ?? false) || (options.recreate ?? false);

  const films = await db.film.findMany({
    where: reindexAll ? {} : { indexedAt: null },
    select: INDEXABLE_FIELDS,
    orderBy: { createdAt: 'asc' },
  });

  let indexed = 0;

  // Sequential on purpose: embeddings APIs rate-limit, and a batch that fails
  // halfway must stop without leaving half the archive marked as indexed.
  for (let start = 0; start < films.length; start += BATCH_SIZE) {
    const batch = films.slice(start, start + BATCH_SIZE);

    indexed += await indexBatch(batch, provider);
  }

  return {
    provider: provider.name,
    model: provider.model,
    dimensions: provider.dimensions,
    indexed,
  };
}

/**
 * Does the collection hold fewer vectors than Postgres claims are indexed?
 *
 * Only a shortfall counts. More points than films is the normal aftermath of
 * deleting a film — the stale point is skipped at search time — and is not a
 * reason to rebuild the archive.
 */
async function indexIsBehind(): Promise<boolean> {
  const [status, marked] = await Promise.all([
    collectionStatus(env.QDRANT_COLLECTION),
    db.film.count({ where: { indexedAt: { not: null } } }),
  ]);

  return status === null || status.points < marked;
}

async function indexBatch(
  batch: readonly IndexableFilm[],
  provider: EmbeddingsProvider,
): Promise<number> {
  const vectors = await provider.generate(batch.map(buildEmbeddingText), 'document');

  const points: FilmPoint[] = batch.map((film, position) => {
    const vector = vectors[position];

    if (vector === undefined) {
      throw new Error(`provider ${provider.name} returned no vector for "${film.title}"`);
    }

    return {
      filmId: film.id,
      vector,
      payload: {
        title: film.title,
        year: film.year,
        archive_category: film.archiveCategory,
        commercial_register: film.commercialRegister,
        emotional_tone: film.emotionalTone,
        provider: provider.name,
        model: provider.model,
      },
    };
  });

  await indexFilms(points);

  await db.film.updateMany({
    where: { id: { in: batch.map((film) => film.id) } },
    data: { indexedAt: new Date() },
  });

  return points.length;
}
