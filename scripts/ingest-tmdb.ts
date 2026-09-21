/**
 * Ingests the factual layer of the archive.
 *
 *   pnpm ingest:tmdb                         # local fixture (no network)
 *   pnpm ingest:tmdb -- --id 62 --id 346     # real records, by TMDB id
 *   pnpm ingest:tmdb -- --title "Rashomon"   # search by title, take the first hit
 *   pnpm ingest:tmdb -- --fixture            # force the fixture even with a token
 *
 * Writes the factual layer only. The 2001 curatorial layer is never touched
 * here — see README § The two buckets.
 */
import { parseArgs } from 'node:util';

import { describeError } from '../src/lib/app-error.util';
import { loadFilmFixture, saveFactualLayer } from '../src/server/archive.service';
import { db } from '../src/server/db.service';
import {
  fetchFilmFromTmdb,
  hasTmdbCredential,
  searchTmdbIds,
} from '../src/server/tmdb.service';

import type { FactualFilm } from '../src/server/tmdb.service';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      id: { type: 'string', multiple: true, default: [] },
      title: { type: 'string', multiple: true, default: [] },
      fixture: { type: 'boolean', default: false },
    },
  });

  const wantsTmdb = values.id.length > 0 || values.title.length > 0;
  const useFixture = values.fixture || !wantsTmdb || !hasTmdbCredential();

  if (useFixture) {
    if (wantsTmdb && !hasTmdbCredential()) {
      console.warn('TMDB_ACCESS_TOKEN missing — ignoring --id/--title and using the fixture.');
    }

    await ingest(await loadFilmFixture(), 'DEV_FIXTURE');
    return;
  }

  await ingest(await collectFromTmdb(values.id, values.title), 'TMDB');
}

async function collectFromTmdb(
  rawIds: readonly string[],
  titles: readonly string[],
): Promise<readonly FactualFilm[]> {
  const ids = rawIds.map((value) => Number.parseInt(value, 10)).filter(Number.isInteger);

  const searchedIds = await Promise.all(
    titles.map(async (title) => {
      const found = await searchTmdbIds(title);

      if (found[0] === undefined) {
        console.warn(`No TMDB result for "${title}".`);
        return null;
      }

      return found[0];
    }),
  );

  const allIds = [...new Set([...ids, ...searchedIds.filter((id) => id !== null)])];

  // Sequential on purpose: the TMDB API rate-limits over a short window.
  const films: FactualFilm[] = [];

  for (const id of allIds) {
    films.push(await fetchFilmFromTmdb(id));
  }

  return films;
}

async function ingest(
  films: readonly FactualFilm[],
  source: 'TMDB' | 'DEV_FIXTURE',
): Promise<void> {
  let created = 0;
  let updated = 0;

  for (const film of films) {
    const result = await saveFactualLayer(film, source);

    if (result.created) {
      created += 1;
    } else {
      updated += 1;
    }

    console.log(`${result.created ? 'new     ' : 'updated '} ${result.title}`);
  }

  console.log(
    `\nSource ${source}: ${String(created)} created, ${String(updated)} updated.` +
      '\nUpdated films were unmarked from the index; run `pnpm index:embeddings`.',
  );
}

try {
  await main();
} catch (e) {
  console.error(`Ingestion failed: ${describeError(e)}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
