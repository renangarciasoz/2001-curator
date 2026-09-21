/**
 * Como um filme chega ao Indicador (e ao front).
 *
 * As chaves são `snake_case` porque isto atravessa uma fronteira: vira JSON num
 * `tool_result` da Messages API e resposta de Route Handler.
 *
 * Os dois baldes continuam separados e rotulados aqui. `fonte_factual` diz de
 * onde veio a ficha; `fonte_curatorial` diz se o estudo é da 2001 ou é dado de
 * demonstração. O Indicador é instruído a não tratar demonstração como curadoria.
 */
export type FilmeParaOIndicador = {
  filme_id: string;

  // ── ficha factual (consulta de terceiros) ──
  titulo: string;
  titulo_original: string | null;
  ano: number | null;
  diretor: string | null;
  pais: string | null;
  sinopse_factual: string | null;
  fonte_factual: string;

  // ── camada curatorial 2001 ──
  tom_emocional: string | null;
  o_que_provoca: string | null;
  registro_comercial: string | null;
  categoria_acervo: string | null;
  notas_curatoriais: string | null;
  contexto_historico: string | null;
  avaliado_por: readonly string[];
  fonte_curatorial: string | null;
  /** `false` quando o filme ainda não recebeu o estudo das curadoras. */
  tem_curadoria_2001: boolean;
};

/** Um candidato devolvido pela busca semântica, com a sua proximidade. */
export type CandidatoParaOIndicador = FilmeParaOIndicador & {
  proximidade: number;
};

/** Uma ponte entre dois filmes, como o Indicador a recebe. */
export type ConexaoParaOIndicador = {
  conexao_id: string;
  tipo: string;
  ponte_por: string;
  porque: string;
  curador: string;
  filme_destino: {
    filme_id: string;
    titulo: string;
    ano: number | null;
    diretor: string | null;
  };
};
