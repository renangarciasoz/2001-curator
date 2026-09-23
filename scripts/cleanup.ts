/**
 * Removes what testing leaves behind.
 *
 *   pnpm cleanup                              # says what it would delete, deletes nothing
 *   pnpm cleanup --empty-sessions --apply     # chats opened and never written in
 *   pnpm cleanup --detached-reviews --apply   # reviews whose chat was deleted
 *   pnpm cleanup --session <uuid> --apply     # one chat, by id
 *   pnpm cleanup --test-data --apply          # every chat, review and persona
 *
 * Two rules hold throughout.
 *
 * Nothing is deleted without `--apply`. A dry run is the default because the
 * thing most likely to be destroyed here is the curatorial dataset, which is
 * the only part of this project that cannot be regenerated.
 *
 * The archive is never touched. `film`, `connection`, `journey` and
 * `editorial_list` are out of reach from this script at any flag combination —
 * re-ingesting them is a separate, idempotent operation, and mixing the two
 * would make "clean up my tests" able to erase the 2001 curation.
 */
import { parseArgs } from 'node:util';

import { describeError } from '../src/lib/app-error.util';
import { db } from '../src/server/db.service';

import { cliArgs } from './cli-args.util';

type Plan = {
  readonly label: string;
  readonly count: number;
  readonly run: () => Promise<number>;
};

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: [...cliArgs()],
    options: {
      'empty-sessions': { type: 'boolean', default: false },
      'detached-reviews': { type: 'boolean', default: false },
      'test-data': { type: 'boolean', default: false },
      session: { type: 'string', multiple: true, default: [] },
      apply: { type: 'boolean', default: false },
    },
  });

  const selected =
    values['empty-sessions'] ||
    values['detached-reviews'] ||
    values['test-data'] ||
    values.session.length > 0;

  if (!selected) {
    await report();
    return;
  }

  const plans: Plan[] = [];

  if (values['test-data']) {
    plans.push(...(await testDataPlans()));
  } else {
    if (values.session.length > 0) {
      plans.push(await namedSessionsPlan(values.session));
    }

    if (values['empty-sessions']) {
      plans.push(await emptySessionsPlan());
    }

    if (values['detached-reviews']) {
      plans.push(await detachedReviewsPlan());
    }
  }

  const total = plans.reduce((sum, plan) => sum + plan.count, 0);

  for (const plan of plans) {
    console.log(`  ${String(plan.count).padStart(5)}  ${plan.label}`);
  }

  if (total === 0) {
    console.log('\nNothing matches. Database unchanged.');
    return;
  }

  if (!values.apply) {
    console.log('\nDry run — nothing was deleted. Add --apply to carry it out.');
    return;
  }

  console.log('');

  for (const plan of plans) {
    const deleted = await plan.run();

    console.log(`  deleted ${String(deleted)} — ${plan.label}`);
  }
}

/** What is in here right now. The default action, because it destroys nothing. */
async function report(): Promise<void> {
  const [sessions, empty, messages, reviews, detached, unreviewed, profiles, films] =
    await Promise.all([
      db.session.count(),
      db.session.count({ where: { messages: { none: {} } } }),
      db.message.count(),
      db.conversation.count(),
      db.conversation.count({ where: { sessionId: null } }),
      db.conversation.count({ where: { quality: null } }),
      db.profile.count(),
      db.film.count(),
    ]);

  console.log('Chats');
  console.log(`  ${String(sessions)} sessions (${String(empty)} with no messages)`);
  console.log(`  ${String(messages)} messages`);
  console.log('');
  console.log('Dataset');
  console.log(
    `  ${String(reviews)} reviews (${String(detached)} detached, ${String(unreviewed)} with no quality yet)`,
  );
  console.log(`  ${String(profiles)} personas`);
  console.log('');
  console.log('Archive (never touched by this script)');
  console.log(`  ${String(films)} films`);
  console.log('');
  console.log(
    'Pick what to remove: --empty-sessions, --detached-reviews, --session <id>, --test-data',
  );
}

async function namedSessionsPlan(ids: readonly string[]): Promise<Plan> {
  const found = await db.session.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true },
  });
  const missing = ids.filter((id) => !found.some((session) => session.id === id));

  for (const id of missing) {
    console.warn(`No session ${id}.`);
  }

  return {
    label: 'named chats (messages cascade; their reviews detach)',
    count: found.length,
    run: async () => {
      const { count } = await db.session.deleteMany({
        where: { id: { in: found.map((s) => s.id) } },
      });

      return count;
    },
  };
}

async function emptySessionsPlan(): Promise<Plan> {
  return {
    label: 'chats opened and never written in',
    count: await db.session.count({ where: { messages: { none: {} } } }),
    run: async () => {
      const { count } = await db.session.deleteMany({ where: { messages: { none: {} } } });

      return count;
    },
  };
}

async function detachedReviewsPlan(): Promise<Plan> {
  return {
    label: 'reviews whose chat was deleted (session_id is null)',
    count: await db.conversation.count({ where: { sessionId: null } }),
    run: async () => {
      const { count } = await db.conversation.deleteMany({ where: { sessionId: null } });

      return count;
    },
  };
}

/**
 * Everything produced by using the tool: chats, the dataset, personas.
 *
 * Order matters — `conversation_film` and `message` cascade, but personas are
 * referenced by both chats and reviews with `ON DELETE SET NULL`, so they go
 * last or the nulling is wasted work.
 */
async function testDataPlans(): Promise<readonly Plan[]> {
  return [
    {
      label: 'ALL reviews — the curatorial dataset',
      count: await db.conversation.count(),
      run: async () => (await db.conversation.deleteMany()).count,
    },
    {
      label: 'ALL chats and their messages',
      count: await db.session.count(),
      run: async () => (await db.session.deleteMany()).count,
    },
    {
      label: 'ALL personas',
      count: await db.profile.count(),
      run: async () => (await db.profile.deleteMany()).count,
    },
  ];
}

try {
  await main();
} catch (e) {
  console.error(`Cleanup failed: ${describeError(e)}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
