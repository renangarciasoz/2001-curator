/**
 * Ingestão da camada factual do acervo.
 *
 *   pnpm ingerir:tmdb                          # fixture local (sem rede)
 *   pnpm ingerir:tmdb -- --id 62 --id 346      # fichas reais, por id do TMDB
 *   pnpm ingerir:tmdb -- --titulo "Rashomon"   # procura pelo título e pega o 1º
 *   pnpm ingerir:tmdb -- --fixture             # força o fixture mesmo com token
 *
 * Só escreve a camada factual. A camada curatorial da 2001 nunca é tocada aqui —
 * ver README § Os dois baldes.
 */
import { parseArgs } from 'node:util';

import { descreverErro } from '../src/lib/app-error.util';
import { carregarFixtureDeFilmes, salvarCamadaFactual } from '../src/server/acervo.service';
import { db } from '../src/server/db.service';
import {
  buscarFilmeNoTmdb,
  procurarIdsNoTmdb,
  temCredencialTmdb,
} from '../src/server/tmdb.service';

import type { FilmeFactual } from '../src/server/tmdb.service';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      id: { type: 'string', multiple: true, default: [] },
      titulo: { type: 'string', multiple: true, default: [] },
      fixture: { type: 'boolean', default: false },
    },
  });

  const ids = values.id ?? [];
  const titulos = values.titulo ?? [];

  const pediuTmdb = ids.length > 0 || titulos.length > 0;
  const usarFixture = (values.fixture ?? false) || !pediuTmdb || !temCredencialTmdb();

  if (usarFixture) {
    if (pediuTmdb && !temCredencialTmdb()) {
      console.warn('TMDB_ACCESS_TOKEN ausente — ignorando --id/--titulo e usando o fixture.');
    }

    await ingerir(await carregarFixtureDeFilmes(), 'FIXTURE_DEV');
    return;
  }

  await ingerir(await coletarDoTmdb(ids, titulos), 'TMDB');
}

async function coletarDoTmdb(
  idsCrus: readonly string[],
  titulos: readonly string[],
): Promise<readonly FilmeFactual[]> {
  const ids = idsCrus.map((valor) => Number.parseInt(valor, 10)).filter(Number.isInteger);

  const idsProcurados = await Promise.all(
    titulos.map(async (titulo) => {
      const encontrados = await procurarIdsNoTmdb(titulo);

      if (encontrados[0] === undefined) {
        console.warn(`Nenhum resultado no TMDB para "${titulo}".`);
        return null;
      }

      return encontrados[0];
    }),
  );

  const todosOsIds = [...new Set([...ids, ...idsProcurados.filter((id) => id !== null)])];

  // Sequencial de propósito: a API do TMDB limita taxa por janela curta.
  const filmes: FilmeFactual[] = [];

  for (const id of todosOsIds) {
    filmes.push(await buscarFilmeNoTmdb(id));
  }

  return filmes;
}

async function ingerir(
  filmes: readonly FilmeFactual[],
  fonte: 'TMDB' | 'FIXTURE_DEV',
): Promise<void> {
  let criados = 0;
  let atualizados = 0;

  for (const filme of filmes) {
    const resultado = await salvarCamadaFactual(filme, fonte);

    if (resultado.criado) {
      criados += 1;
    } else {
      atualizados += 1;
    }

    console.log(`${resultado.criado ? 'novo    ' : 'atualiza'}  ${resultado.titulo}`);
  }

  console.log(
    `\nFonte ${fonte}: ${String(criados)} criados, ${String(atualizados)} atualizados.` +
      '\nOs filmes atualizados foram desmarcados do índice; rode `pnpm indexar:embeddings`.',
  );
}

try {
  await main();
} catch (e) {
  console.error(`Ingestão falhou: ${descreverErro(e)}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
