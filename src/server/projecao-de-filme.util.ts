import 'server-only';

import type { FilmeParaOIndicador } from '@/lib/filme.type';
import type { Prisma } from '@prisma/client';

/**
 * Os campos que o Indicador pode ver. Declarados uma vez e reusados por todas as
 * tools, para que nenhuma consulta amplie por acidente o que sai do banco.
 */
export const CAMPOS_PARA_O_INDICADOR = {
  id: true,
  titulo: true,
  tituloOriginal: true,
  ano: true,
  diretor: true,
  pais: true,
  sinopseFactual: true,
  fonteFactual: true,
  tomEmocional: true,
  oQueProvoca: true,
  registroComercial: true,
  categoriaAcervo: true,
  notasCuratoriais: true,
  contextoHistorico: true,
  avaliadoPor: true,
  fonteCuratorial: true,
} as const satisfies Prisma.FilmeSelect;

export type FilmeSelecionado = Prisma.FilmeGetPayload<{
  select: typeof CAMPOS_PARA_O_INDICADOR;
}>;

/** Converte a linha do Postgres na forma que atravessa a fronteira. */
export function projetarFilme(filme: FilmeSelecionado): FilmeParaOIndicador {
  return {
    filme_id: filme.id,

    titulo: filme.titulo,
    titulo_original: filme.tituloOriginal,
    ano: filme.ano,
    diretor: filme.diretor,
    pais: filme.pais,
    sinopse_factual: filme.sinopseFactual,
    fonte_factual: filme.fonteFactual,

    tom_emocional: filme.tomEmocional,
    o_que_provoca: filme.oQueProvoca,
    registro_comercial: filme.registroComercial,
    categoria_acervo: filme.categoriaAcervo,
    notas_curatoriais: filme.notasCuratoriais,
    contexto_historico: filme.contextoHistorico,
    avaliado_por: filme.avaliadoPor,
    fonte_curatorial: filme.fonteCuratorial,
    tem_curadoria_2001: filme.fonteCuratorial === 'CURADORIA_2001',
  };
}
