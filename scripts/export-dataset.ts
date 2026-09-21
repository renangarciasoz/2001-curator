/**
 * Exports the curatorial dataset as JSONL.
 *
 *   pnpm export:dataset                            # to stdout
 *   pnpm export:dataset -- --out exports/2026-09.jsonl
 *
 * Only conversations the quality gate absorbed come out, and only the 2001
 * archive's own content — see README § The two buckets.
 *
 * This prepares Phase 2; it trains nothing. Fine-tuning runs outside this repo.
 */
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';

import { describeError } from '../src/lib/app-error.util';
import { db } from '../src/server/db.service';
import { countDatasetLines, exportDatasetJsonl } from '../src/server/exporter.service';

import { cliArgs } from './cli-args.util';

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: [...cliArgs()],
    options: { out: { type: 'string' } },
  });

  const total = await countDatasetLines();

  if (values.out === undefined) {
    for await (const line of exportDatasetJsonl()) {
      process.stdout.write(line);
    }

    return;
  }

  const fullPath = path.resolve(process.cwd(), values.out);

  await mkdir(path.dirname(fullPath), { recursive: true });
  await pipeline(exportDatasetJsonl(), createWriteStream(fullPath, { encoding: 'utf8' }));

  console.log(`${String(total)} conversations exported to ${fullPath}.`);
}

try {
  await main();
} catch (e) {
  console.error(`Export failed: ${describeError(e)}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
