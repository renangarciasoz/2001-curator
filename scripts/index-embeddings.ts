/**
 * Generates the archive's embeddings and indexes them in Qdrant.
 *
 *   pnpm index:embeddings              # only what is pending
 *   pnpm index:embeddings -- --all     # re-index the whole archive
 *   pnpm index:embeddings -- --recreate # drop the collection and start over
 *
 * `--recreate` is how you switch embeddings provider: vectors from different
 * providers do not compare, so the whole index has to be rebuilt.
 */
import { parseArgs } from 'node:util';

import { describeError } from '../src/lib/app-error.util';
import { db } from '../src/server/db.service';
import { indexArchive } from '../src/server/indexing.service';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      all: { type: 'boolean', default: false },
      recreate: { type: 'boolean', default: false },
    },
  });

  const result = await indexArchive({ all: values.all, recreate: values.recreate });

  console.log(
    `Provider ${result.provider} (${result.model}, ` +
      `${String(result.dimensions)} dimensions): ` +
      `${String(result.indexed)} films indexed.`,
  );

  if (result.provider === 'local' && result.indexed > 0) {
    console.warn(
      '\nWarning: the `local` provider approximates word overlap, not meaning.\n' +
        'For the real archive, configure VOYAGE_API_KEY and run with --recreate.',
    );
  }
}

try {
  await main();
} catch (e) {
  console.error(`Indexing failed: ${describeError(e)}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
