/**
 * Seeds a DEMONSTRATION curatorial layer over the already-ingested archive.
 *
 *   pnpm db:seed             # apply
 *   pnpm db:seed -- --clear  # remove everything this script created
 *
 * None of this is 2001 curation. Everything lands with curatorial_source = DEMO
 * and curator = DEMO; the dataset exporter ignores it, and a CHECK constraint
 * prevents it from presenting itself as reviewed by Sonia or Mirella.
 *
 * It exists so the tool has something to show on day one — semantic search over
 * a curatorial layer, bridges with reasons, a journey, an editorial list.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { describeError } from '../src/lib/app-error.util';
import { ARCHIVE_CATEGORIES } from '../src/lib/taxonomy.constant';
import { db } from '../src/server/db.service';

import { cliArgs } from './cli-args.util';

const SEED_PATH = path.join('data', 'demo-curation.json');

const SeedSchema = z.object({
  films: z.array(
    z.object({
      title: z.string(),
      emotionalTone: z.string(),
      whatItProvokes: z.string(),
      commercialRegister: z.enum(['COMMERCIAL', 'ARTHOUSE', 'BOTH']),
      archiveCategory: z.enum(ARCHIVE_CATEGORIES),
      historicalContext: z.string(),
      curatorialNotes: z.string(),
    }),
  ),
  connections: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      type: z.enum([
        'ENTRY_POINT',
        'IF_YOU_LIKED',
        'BEFORE_WATCHING',
        'RELEASE_TO_ARCHIVE',
        'ARCHIVE_TO_RELEASE',
        'OTHER',
      ]),
      bridgedBy: z.string(),
      why: z.string().min(1),
    }),
  ),
  journeys: z.array(
    z.object({
      title: z.string(),
      objective: z.string(),
      films: z.array(z.object({ title: z.string(), whyNote: z.string().min(1) })),
    }),
  ),
  editorialLists: z.array(
    z.object({
      title: z.string(),
      period: z.string(),
      type: z.enum(['MONTHLY_TOP', 'THEMATIC', 'EVENT', 'HISTORIC_OMO']),
      films: z.array(z.object({ title: z.string(), curationLine: z.string().min(1) })),
    }),
  ),
});

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: [...cliArgs()],
    options: { clear: { type: 'boolean', default: false } },
  });

  if (values.clear) {
    await clear();
    return;
  }

  const seed = SeedSchema.parse(JSON.parse(await readFile(path.resolve(SEED_PATH), 'utf8')));
  const idByTitle = await mapFilms();

  if (idByTitle.size === 0) {
    console.error('Archive is empty. Run `pnpm ingest:tmdb` before seeding the demo.');
    process.exitCode = 1;
    return;
  }

  let curated = 0;

  for (const film of seed.films) {
    const filmId = idByTitle.get(film.title);

    if (filmId === undefined) {
      console.warn(`"${film.title}" is not in the archive — skipping.`);
      continue;
    }

    await db.film.update({
      where: { id: filmId },
      data: {
        emotionalTone: film.emotionalTone,
        whatItProvokes: film.whatItProvokes,
        commercialRegister: film.commercialRegister,
        archiveCategory: film.archiveCategory,
        historicalContext: film.historicalContext,
        curatorialNotes: film.curatorialNotes,
        curatorialSource: 'DEMO',
        reviewedBy: [],
        // The curatorial layer changed: the indexed vector is stale.
        indexedAt: null,
      },
    });

    curated += 1;
  }

  const connections = await seedConnections(seed.connections, idByTitle);
  const journeys = await seedJourneys(seed.journeys, idByTitle);
  const lists = await seedEditorialLists(seed.editorialLists, idByTitle);

  console.log(
    `Demo seeded: ${String(curated)} films with a curatorial layer, ` +
      `${String(connections)} connections, ${String(journeys)} journeys, ` +
      `${String(lists)} editorial lists.\n` +
      'All marked DEMO and excluded from the exported dataset.\n' +
      'Run `pnpm index:embeddings` so search picks up the new layer.',
  );
}

async function mapFilms(): Promise<Map<string, string>> {
  const films = await db.film.findMany({ select: { id: true, title: true } });

  return new Map(films.map((film) => [film.title, film.id]));
}

async function seedConnections(
  connections: z.infer<typeof SeedSchema>['connections'],
  idByTitle: ReadonlyMap<string, string>,
): Promise<number> {
  let created = 0;

  for (const connection of connections) {
    const sourceFilmId = idByTitle.get(connection.source);
    const targetFilmId = idByTitle.get(connection.target);

    if (sourceFilmId === undefined || targetFilmId === undefined) {
      continue;
    }

    await db.connection.upsert({
      where: {
        sourceFilmId_targetFilmId_type: {
          sourceFilmId,
          targetFilmId,
          type: connection.type,
        },
      },
      create: {
        sourceFilmId,
        targetFilmId,
        type: connection.type,
        bridgedBy: connection.bridgedBy,
        why: connection.why,
        curator: 'DEMO',
      },
      update: { bridgedBy: connection.bridgedBy, why: connection.why },
    });

    created += 1;
  }

  return created;
}

async function seedJourneys(
  journeys: z.infer<typeof SeedSchema>['journeys'],
  idByTitle: ReadonlyMap<string, string>,
): Promise<number> {
  let created = 0;

  for (const journey of journeys) {
    const existing = await db.journey.findFirst({
      where: { title: journey.title, curator: 'DEMO' },
      select: { id: true },
    });

    if (existing !== null) {
      continue;
    }

    const items = journey.films.flatMap((item, position) => {
      const filmId = idByTitle.get(item.title);

      return filmId === undefined ? [] : [{ filmId, position, whyNote: item.whyNote }];
    });

    await db.journey.create({
      data: {
        title: journey.title,
        objective: journey.objective,
        curator: 'DEMO',
        films: { create: items },
      },
    });

    created += 1;
  }

  return created;
}

async function seedEditorialLists(
  lists: z.infer<typeof SeedSchema>['editorialLists'],
  idByTitle: ReadonlyMap<string, string>,
): Promise<number> {
  let created = 0;

  for (const list of lists) {
    const existing = await db.editorialList.findFirst({
      where: { title: list.title, curator: 'DEMO' },
      select: { id: true },
    });

    if (existing !== null) {
      continue;
    }

    const items = list.films.flatMap((item, position) => {
      const filmId = idByTitle.get(item.title);

      return filmId === undefined ? [] : [{ filmId, position, curationLine: item.curationLine }];
    });

    await db.editorialList.create({
      data: {
        title: list.title,
        period: list.period,
        type: list.type,
        curator: 'DEMO',
        publishedAt: new Date(),
        films: { create: items },
      },
    });

    created += 1;
  }

  return created;
}

/** Removes everything the seed created, without touching real curation. */
async function clear(): Promise<void> {
  const { count: connections } = await db.connection.deleteMany({ where: { curator: 'DEMO' } });
  const { count: journeys } = await db.journey.deleteMany({ where: { curator: 'DEMO' } });
  const { count: lists } = await db.editorialList.deleteMany({ where: { curator: 'DEMO' } });

  const { count: films } = await db.film.updateMany({
    where: { curatorialSource: 'DEMO' },
    data: {
      emotionalTone: null,
      whatItProvokes: null,
      commercialRegister: null,
      archiveCategory: null,
      historicalContext: null,
      curatorialNotes: null,
      curatorialSource: null,
      indexedAt: null,
    },
  });

  console.log(
    `Demo removed: ${String(films)} films cleared, ${String(connections)} connections, ` +
      `${String(journeys)} journeys, ${String(lists)} editorial lists.`,
  );
}

try {
  await main();
} catch (e) {
  console.error(`Seed failed: ${describeError(e)}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
