import 'server-only';

import { paraIso8601Utc } from '@/lib/data.util';
import { VERSAO_DO_METODO } from '@/method/system-prompt.constant';

import { db } from './db.service';

const TAMANHO_DA_PAGINA = 200;

/**
 * Como o dataset da Fase 2 vê um filme.
 *
 * Identidade (título, ano) entra por referência — sem ela o registro é ilegível.
 * Prosa de terceiros não entra de jeito nenhum: sinopse do TMDB, pôster e
 * qualquer outro texto do balde externo ficam de fora do arquivo, por construção.
 * O estudo das curadoras entra inteiro, e só quando é curadoria de verdade —
 * dado de demonstração nunca atravessa.
 */
type FilmeExportado = {
  filme_id: string;
  titulo: string;
  ano: number | null;
  tom_emocional: string | null;
  o_que_provoca: string | null;
  registro_comercial: string | null;
  notas_curatoriais: string | null;
  contexto_historico: string | null;
  categoria_acervo: string | null;
};

export type LinhaDoDataset = {
  id: string;
  versao_do_metodo: number;
  registrado_em: string;
  pedido_do_usuario: string;
  perguntas_da_ia: unknown;
  recomendacao_da_ia: string;
  correcao: string | null;
  porque_da_correcao: string | null;
  avaliado_por: string | null;
  consenso: string | null;
  confianca: string | null;
  filmes_recomendados: readonly FilmeExportado[];
  filmes_corrigidos: readonly FilmeExportado[];
  procedencia: {
    balde: 'curadoria_2001';
    treinavel: true;
    prosa_de_terceiros_incluida: false;
    observacao: string;
  };
};

const OBSERVACAO_DE_PROCEDENCIA =
  'Conteúdo próprio da 2001. Título e ano de cada filme entram apenas como ' +
  'identificação; nenhuma sinopse, imagem ou texto de base pública foi incluído.';

/**
 * Exporta o dataset curatorial, uma linha JSON por conversa.
 *
 * Só sai o que o portão de qualidade absorveu. Conversas em REVISAR ficam de
 * fora de propósito: uma divergência entre Sonia e Mirella é dado valioso, mas
 * não é rótulo — treinar nela ensinaria o modelo a escolher um lado que as
 * curadoras não escolheram.
 *
 * Gera sob demanda, paginando por cursor: o arquivo pode crescer sem limite e
 * nunca precisa caber na memória.
 */
export async function* exportarDatasetJsonl(): AsyncGenerator<string> {
  let cursor: string | undefined;

  for (;;) {
    const pagina = await db.conversa.findMany({
      where: { qualidade: 'ABSORVE' },
      select: {
        id: true,
        pedidoDoUsuario: true,
        perguntasDaIa: true,
        recomendacaoDaIa: true,
        correcao: true,
        porqueDaCorrecao: true,
        avaliadoPor: true,
        consenso: true,
        confianca: true,
        createdAt: true,
        filmes: {
          select: {
            papel: true,
            ordem: true,
            filme: {
              select: {
                id: true,
                titulo: true,
                ano: true,
                tomEmocional: true,
                oQueProvoca: true,
                registroComercial: true,
                notasCuratoriais: true,
                contextoHistorico: true,
                categoriaAcervo: true,
                fonteCuratorial: true,
              },
            },
          },
          orderBy: { ordem: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
      take: TAMANHO_DA_PAGINA,
      ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (pagina.length === 0) {
      return;
    }

    for (const conversa of pagina) {
      yield `${JSON.stringify(montarLinha(conversa))}\n`;
    }

    cursor = pagina[pagina.length - 1]?.id;

    if (cursor === undefined || pagina.length < TAMANHO_DA_PAGINA) {
      return;
    }
  }
}

/** Quantas conversas o arquivo teria agora. */
export function contarLinhasDoDataset(): Promise<number> {
  return db.conversa.count({ where: { qualidade: 'ABSORVE' } });
}

type ConversaComFilmes = {
  id: string;
  pedidoDoUsuario: string;
  perguntasDaIa: unknown;
  recomendacaoDaIa: string;
  correcao: string | null;
  porqueDaCorrecao: string | null;
  avaliadoPor: string | null;
  consenso: string | null;
  confianca: string | null;
  createdAt: Date;
  filmes: readonly {
    papel: string;
    filme: {
      id: string;
      titulo: string;
      ano: number | null;
      tomEmocional: string | null;
      oQueProvoca: string | null;
      registroComercial: string | null;
      notasCuratoriais: string | null;
      contextoHistorico: string | null;
      categoriaAcervo: string | null;
      fonteCuratorial: string | null;
    };
  }[];
};

function montarLinha(conversa: ConversaComFilmes): LinhaDoDataset {
  return {
    id: conversa.id,
    versao_do_metodo: VERSAO_DO_METODO,
    registrado_em: paraIso8601Utc(conversa.createdAt),
    pedido_do_usuario: conversa.pedidoDoUsuario,
    perguntas_da_ia: conversa.perguntasDaIa,
    recomendacao_da_ia: conversa.recomendacaoDaIa,
    correcao: conversa.correcao,
    porque_da_correcao: conversa.porqueDaCorrecao,
    avaliado_por: conversa.avaliadoPor,
    consenso: conversa.consenso,
    confianca: conversa.confianca,
    filmes_recomendados: projetarFilmes(conversa, 'RECOMENDADO_PELA_IA'),
    filmes_corrigidos: projetarFilmes(conversa, 'CORRIGIDO_PELA_CURADORA'),
    procedencia: {
      balde: 'curadoria_2001',
      treinavel: true,
      prosa_de_terceiros_incluida: false,
      observacao: OBSERVACAO_DE_PROCEDENCIA,
    },
  };
}

function projetarFilmes(conversa: ConversaComFilmes, papel: string): readonly FilmeExportado[] {
  return conversa.filmes
    .filter((vinculo) => vinculo.papel === papel)
    .map(({ filme }) => {
      // Sem curadoria de verdade, só a identificação atravessa: dado de
      // demonstração não pode se passar por estudo das curadoras no treino.
      const ehCuradoria2001 = filme.fonteCuratorial === 'CURADORIA_2001';

      return {
        filme_id: filme.id,
        titulo: filme.titulo,
        ano: filme.ano,
        tom_emocional: ehCuradoria2001 ? filme.tomEmocional : null,
        o_que_provoca: ehCuradoria2001 ? filme.oQueProvoca : null,
        registro_comercial: ehCuradoria2001 ? filme.registroComercial : null,
        notas_curatoriais: ehCuradoria2001 ? filme.notasCuratoriais : null,
        contexto_historico: ehCuradoria2001 ? filme.contextoHistorico : null,
        categoria_acervo: ehCuradoria2001 ? filme.categoriaAcervo : null,
      };
    });
}
