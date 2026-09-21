/**
 * Exporta o dataset curatorial em JSONL.
 *
 *   pnpm exportar:dataset                              # para a saída padrão
 *   pnpm exportar:dataset -- --saida exports/2026-09.jsonl
 *
 * Só saem as conversas que o portão de qualidade absorveu, e só o conteúdo
 * próprio da 2001 — ver README § Os dois baldes.
 *
 * Isto prepara a Fase 2; não treina nada. O fine-tuning roda fora deste repo.
 */
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';

import { descreverErro } from '../src/lib/app-error.util';
import { db } from '../src/server/db.service';
import { contarLinhasDoDataset, exportarDatasetJsonl } from '../src/server/exportador.service';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { saida: { type: 'string' } },
  });

  const total = await contarLinhasDoDataset();

  if (values.saida === undefined) {
    for await (const linha of exportarDatasetJsonl()) {
      process.stdout.write(linha);
    }

    return;
  }

  const caminho = path.resolve(process.cwd(), values.saida);

  await mkdir(path.dirname(caminho), { recursive: true });
  await pipeline(exportarDatasetJsonl(), createWriteStream(caminho, { encoding: 'utf8' }));

  console.log(`${String(total)} conversas exportadas para ${caminho}.`);
}

try {
  await main();
} catch (e) {
  console.error(`Exportação falhou: ${descreverErro(e)}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
