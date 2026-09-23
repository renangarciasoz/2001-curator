/**
 * Checks every service a recommendation depends on, in the order it depends on
 * them, and says which one is broken.
 *
 *   pnpm doctor              # against .env
 *   pnpm prod pnpm doctor    # against .env.neon
 *
 * This exists because a failing tool call reaches the curator as the Indicador
 * politely declining to invent a film. That is the right behaviour and a
 * terrible diagnostic: "the archive is not responding" covers a stopped
 * container, an unindexed collection, a rejected API key and a dimension
 * mismatch, and they are fixed in four different ways.
 *
 * Nothing here writes. It is safe to run against production.
 */
import { describeError } from '../src/lib/app-error.util';
import { db } from '../src/server/db.service';
import { getEmbeddingsProvider } from '../src/server/embeddings/embeddings.service';
import { env } from '../src/server/env.config';
import { collectionStatus, searchByVector } from '../src/server/qdrant.service';

type Check = {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
  /** What to do about it. Empty when there is nothing to do. */
  readonly fix?: string;
};

async function main(): Promise<void> {
  const checks: Check[] = [];

  const postgres = await checkPostgres();
  checks.push(postgres);

  const qdrant = await checkQdrant();
  checks.push(qdrant);

  const embeddings = await checkEmbeddings();
  checks.push(embeddings);

  if (qdrant.ok && embeddings.ok) {
    checks.push(await checkSearch());
  } else {
    checks.push({
      name: 'archive search',
      ok: false,
      detail: 'not attempted — fix the checks above first',
    });
  }

  console.log('');

  for (const check of checks) {
    console.log(`${check.ok ? ' ok ' : 'FAIL'}  ${check.name.padEnd(18)} ${check.detail}`);

    if (check.fix !== undefined) {
      console.log(`      ${' '.repeat(18)} → ${check.fix}`);
    }
  }

  const broken = checks.filter((check) => !check.ok);

  console.log('');

  if (broken.length === 0) {
    console.log('Everything the Indicador needs is answering.');
    return;
  }

  console.log(`${String(broken.length)} of ${String(checks.length)} checks failed.`);
  process.exitCode = 1;
}

async function checkPostgres(): Promise<Check> {
  try {
    const [films, indexed] = await Promise.all([
      db.film.count(),
      db.film.count({ where: { indexedAt: { not: null } } }),
    ]);

    if (films === 0) {
      return {
        name: 'postgres',
        ok: false,
        detail: 'connected, but the archive is empty',
        fix: 'pnpm ingest:tmdb',
      };
    }

    return {
      name: 'postgres',
      ok: true,
      detail: `${String(films)} films, ${String(indexed)} marked as indexed`,
      ...(indexed < films ? { fix: 'pnpm index:embeddings — some films have no vector' } : {}),
    };
  } catch (e) {
    return {
      name: 'postgres',
      ok: false,
      detail: describeError(e),
      fix: 'docker compose up -d postgres, and check DATABASE_URL',
    };
  }
}

async function checkQdrant(): Promise<Check> {
  try {
    const status = await collectionStatus(env.QDRANT_COLLECTION);

    if (status === null) {
      return {
        name: 'qdrant',
        ok: false,
        detail: `reachable, but collection "${env.QDRANT_COLLECTION}" does not exist`,
        fix: 'pnpm index:embeddings --recreate',
      };
    }

    if (status.points === 0) {
      return {
        name: 'qdrant',
        ok: false,
        detail: `collection "${env.QDRANT_COLLECTION}" exists but holds no vectors`,
        fix: 'pnpm index:embeddings',
      };
    }

    return {
      name: 'qdrant',
      ok: true,
      detail: `${String(status.points)} vectors, ${String(status.dimensions)} dimensions`,
    };
  } catch (e) {
    return {
      name: 'qdrant',
      ok: false,
      detail: describeError(e),
      fix: 'docker compose up -d qdrant, and check QDRANT_URL / QDRANT_API_KEY',
    };
  }
}

async function checkEmbeddings(): Promise<Check> {
  const provider = getEmbeddingsProvider();

  try {
    const [vector] = await provider.generate(['um filme sobre o tempo passando'], 'query');

    if (vector === undefined || vector.length === 0) {
      return {
        name: 'embeddings',
        ok: false,
        detail: `${provider.name} returned no vector`,
      };
    }

    if (vector.length !== provider.dimensions) {
      return {
        name: 'embeddings',
        ok: false,
        detail: `${provider.name} returned ${String(vector.length)} dimensions, expected ${String(provider.dimensions)}`,
      };
    }

    return {
      name: 'embeddings',
      ok: true,
      detail: `${provider.name} (${provider.model}), ${String(vector.length)} dimensions`,
    };
  } catch (e) {
    return {
      name: 'embeddings',
      ok: false,
      detail: `${provider.name}: ${describeError(e)}`,
      fix: `check the key for EMBEDDINGS_PROVIDER=${env.EMBEDDINGS_PROVIDER}`,
    };
  }
}

/** The real thing, end to end: the exact path `search_films` takes. */
async function checkSearch(): Promise<Check> {
  try {
    const provider = getEmbeddingsProvider();
    const [vector] = await provider.generate(['família e a passagem do tempo'], 'query');

    if (vector === undefined) {
      return { name: 'archive search', ok: false, detail: 'no query vector' };
    }

    const candidates = await searchByVector(vector, 3);

    if (candidates.length === 0) {
      return {
        name: 'archive search',
        ok: false,
        detail: 'search ran but matched nothing',
        fix: 'the index may be stale: pnpm index:embeddings --recreate',
      };
    }

    const films = await db.film.findMany({
      where: { id: { in: candidates.map((candidate) => candidate.filmId) } },
      select: { id: true, title: true },
    });

    const titles = candidates
      .map((candidate) => films.find((film) => film.id === candidate.filmId)?.title)
      .filter((title) => title !== undefined);

    if (titles.length === 0) {
      return {
        name: 'archive search',
        ok: false,
        detail: 'Qdrant returned points with no matching film in Postgres',
        fix: 'the two stores disagree: pnpm index:embeddings --recreate',
      };
    }

    return { name: 'archive search', ok: true, detail: titles.join(', ') };
  } catch (e) {
    return { name: 'archive search', ok: false, detail: describeError(e) };
  }
}

try {
  await main();
} catch (e) {
  console.error(`Doctor failed: ${describeError(e)}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
