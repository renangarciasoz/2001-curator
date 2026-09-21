/**
 * Semeia uma camada curatorial de DEMONSTRAÇÃO sobre o acervo já ingerido.
 *
 *   pnpm db:seed          # aplica
 *   pnpm db:seed -- --limpar  # remove tudo o que este script criou
 *
 * Nada aqui é curadoria da 2001. Tudo entra marcado com fonte_curatorial = DEMO
 * e curador = DEMO; o exportador do dataset ignora, e uma CHECK constraint
 * impede que este dado se apresente como avaliado por Sonia ou Mirella.
 *
 * Existe para que a ferramenta tenha o que mostrar no primeiro dia — busca
 * semântica sobre camada curatorial, pontes com porquê, jornada, lista editorial.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { descreverErro } from '../src/lib/app-error.util';
import { CATEGORIAS_DO_ACERVO } from '../src/lib/taxonomia.constant';
import { db } from '../src/server/db.service';

const CAMINHO = path.join('data', 'curadoria-demo.json');

const SeedSchema = z.object({
  filmes: z.array(
    z.object({
      titulo: z.string(),
      tomEmocional: z.string(),
      oQueProvoca: z.string(),
      registroComercial: z.enum(['COMERCIAL', 'CABECA', 'AMBOS']),
      categoriaAcervo: z.enum(CATEGORIAS_DO_ACERVO),
      contextoHistorico: z.string(),
      notasCuratoriais: z.string(),
    }),
  ),
  conexoes: z.array(
    z.object({
      origem: z.string(),
      destino: z.string(),
      tipo: z.enum([
        'PORTA_DE_ENTRADA',
        'SE_GOSTOU_DE',
        'ANTES_DE_VER',
        'LANCAMENTO_PARA_ACERVO',
        'ACERVO_PARA_LANCAMENTO',
        'OUTRO',
      ]),
      pontePor: z.string(),
      porque: z.string().min(1),
    }),
  ),
  jornadas: z.array(
    z.object({
      titulo: z.string(),
      objetivo: z.string(),
      filmes: z.array(z.object({ titulo: z.string(), notaDoPorque: z.string().min(1) })),
    }),
  ),
  listas: z.array(
    z.object({
      titulo: z.string(),
      periodo: z.string(),
      tipo: z.enum(['TOP_DO_MES', 'TEMATICO', 'EVENTO', 'OMO_HISTORICA']),
      filmes: z.array(z.object({ titulo: z.string(), linhaDeCuradoria: z.string().min(1) })),
    }),
  ),
});

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { limpar: { type: 'boolean', default: false } } });

  if (values.limpar) {
    await limpar();
    return;
  }

  const seed = SeedSchema.parse(JSON.parse(await readFile(path.resolve(CAMINHO), 'utf8')));
  const idPorTitulo = await mapearFilmes();

  if (idPorTitulo.size === 0) {
    console.error('Acervo vazio. Rode `pnpm ingerir:tmdb` antes de semear a demonstração.');
    process.exitCode = 1;
    return;
  }

  let curados = 0;

  for (const filme of seed.filmes) {
    const filmeId = idPorTitulo.get(filme.titulo);

    if (filmeId === undefined) {
      console.warn(`"${filme.titulo}" não está no acervo — pulando.`);
      continue;
    }

    await db.filme.update({
      where: { id: filmeId },
      data: {
        tomEmocional: filme.tomEmocional,
        oQueProvoca: filme.oQueProvoca,
        registroComercial: filme.registroComercial,
        categoriaAcervo: filme.categoriaAcervo,
        contextoHistorico: filme.contextoHistorico,
        notasCuratoriais: filme.notasCuratoriais,
        fonteCuratorial: 'DEMO',
        avaliadoPor: [],
        // A camada curatorial mudou: o vetor indexado ficou velho.
        indexadoEm: null,
      },
    });

    curados += 1;
  }

  const conexoes = await semearConexoes(seed.conexoes, idPorTitulo);
  const jornadas = await semearJornadas(seed.jornadas, idPorTitulo);
  const listas = await semearListas(seed.listas, idPorTitulo);

  console.log(
    `Demonstração semeada: ${String(curados)} filmes com camada curatorial, ` +
      `${String(conexoes)} conexões, ${String(jornadas)} jornadas, ${String(listas)} listas.\n` +
      'Tudo marcado como DEMO e fora do dataset exportado.\n' +
      'Rode `pnpm indexar:embeddings` para a busca enxergar a camada nova.',
  );
}

async function mapearFilmes(): Promise<Map<string, string>> {
  const filmes = await db.filme.findMany({ select: { id: true, titulo: true } });

  return new Map(filmes.map((filme) => [filme.titulo, filme.id]));
}

async function semearConexoes(
  conexoes: z.infer<typeof SeedSchema>['conexoes'],
  idPorTitulo: ReadonlyMap<string, string>,
): Promise<number> {
  let criadas = 0;

  for (const conexao of conexoes) {
    const origemId = idPorTitulo.get(conexao.origem);
    const destinoId = idPorTitulo.get(conexao.destino);

    if (origemId === undefined || destinoId === undefined) {
      continue;
    }

    await db.conexao.upsert({
      where: {
        filmeOrigemId_filmeDestinoId_tipo: {
          filmeOrigemId: origemId,
          filmeDestinoId: destinoId,
          tipo: conexao.tipo,
        },
      },
      create: {
        filmeOrigemId: origemId,
        filmeDestinoId: destinoId,
        tipo: conexao.tipo,
        pontePor: conexao.pontePor,
        porque: conexao.porque,
        curador: 'DEMO',
      },
      update: { pontePor: conexao.pontePor, porque: conexao.porque },
    });

    criadas += 1;
  }

  return criadas;
}

async function semearJornadas(
  jornadas: z.infer<typeof SeedSchema>['jornadas'],
  idPorTitulo: ReadonlyMap<string, string>,
): Promise<number> {
  let criadas = 0;

  for (const jornada of jornadas) {
    const existente = await db.jornada.findFirst({
      where: { titulo: jornada.titulo, curador: 'DEMO' },
      select: { id: true },
    });

    if (existente !== null) {
      continue;
    }

    const itens = jornada.filmes
      .map((item, ordem) => ({ filmeId: idPorTitulo.get(item.titulo), ordem, ...item }))
      .filter((item): item is typeof item & { filmeId: string } => item.filmeId !== undefined);

    await db.jornada.create({
      data: {
        titulo: jornada.titulo,
        objetivo: jornada.objetivo,
        curador: 'DEMO',
        filmes: {
          create: itens.map((item) => ({
            filmeId: item.filmeId,
            ordem: item.ordem,
            notaDoPorque: item.notaDoPorque,
          })),
        },
      },
    });

    criadas += 1;
  }

  return criadas;
}

async function semearListas(
  listas: z.infer<typeof SeedSchema>['listas'],
  idPorTitulo: ReadonlyMap<string, string>,
): Promise<number> {
  let criadas = 0;

  for (const lista of listas) {
    const existente = await db.listaEditorial.findFirst({
      where: { titulo: lista.titulo, curador: 'DEMO' },
      select: { id: true },
    });

    if (existente !== null) {
      continue;
    }

    const itens = lista.filmes
      .map((item, ordem) => ({ filmeId: idPorTitulo.get(item.titulo), ordem, ...item }))
      .filter((item): item is typeof item & { filmeId: string } => item.filmeId !== undefined);

    await db.listaEditorial.create({
      data: {
        titulo: lista.titulo,
        periodo: lista.periodo,
        tipo: lista.tipo,
        curador: 'DEMO',
        publicadaEm: new Date(),
        filmes: {
          create: itens.map((item) => ({
            filmeId: item.filmeId,
            ordem: item.ordem,
            linhaDeCuradoria: item.linhaDeCuradoria,
          })),
        },
      },
    });

    criadas += 1;
  }

  return criadas;
}

/** Remove tudo o que o seed criou, sem tocar em curadoria real. */
async function limpar(): Promise<void> {
  const { count: conexoes } = await db.conexao.deleteMany({ where: { curador: 'DEMO' } });
  const { count: jornadas } = await db.jornada.deleteMany({ where: { curador: 'DEMO' } });
  const { count: listas } = await db.listaEditorial.deleteMany({ where: { curador: 'DEMO' } });

  const { count: filmes } = await db.filme.updateMany({
    where: { fonteCuratorial: 'DEMO' },
    data: {
      tomEmocional: null,
      oQueProvoca: null,
      registroComercial: null,
      categoriaAcervo: null,
      contextoHistorico: null,
      notasCuratoriais: null,
      fonteCuratorial: null,
      indexadoEm: null,
    },
  });

  console.log(
    `Demonstração removida: ${String(filmes)} filmes limpos, ${String(conexoes)} conexões, ` +
      `${String(jornadas)} jornadas, ${String(listas)} listas.`,
  );
}

try {
  await main();
} catch (e) {
  console.error(`Seed falhou: ${descreverErro(e)}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
