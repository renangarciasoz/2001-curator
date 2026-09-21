import 'server-only';

import { AppError, FeedbackAmbiguoError, descreverErro } from '@/lib/app-error.util';

import { BuscarConexoesInputSchema, buscarConexoes } from './buscar-conexoes.service';
import { BuscarFilmesInputSchema, buscarFilmes } from './buscar-filmes.service';
import { DetalhesDoFilmeInputSchema, detalhesDoFilme } from './detalhes-do-filme.service';
import { RegistrarFeedbackInputSchema, registrarFeedback } from './registrar-feedback.service';

export type ResultadoDeTool = {
  /** JSON serializado, pronto para virar o conteúdo de um `tool_result`. */
  conteudo: string;
  /** Marca o bloco com `is_error` para o modelo saber que precisa corrigir o rumo. */
  ehErro: boolean;
};

/** Contexto que a aplicação injeta e o modelo não precisa (nem deve) inventar. */
export type ContextoDaTool = {
  readonly sessaoId: string;
  readonly perfilId: string | null;
};

/**
 * Executa uma tool chamada pelo Indicador.
 *
 * Os argumentos vêm do modelo e são entrada não confiável: cada um passa pelo
 * schema Zod da sua tool antes de chegar ao domínio. Um erro de domínio vira
 * `tool_result` com `is_error`, nunca uma exceção que derruba a conversa — o
 * modelo consegue ler a mensagem e tentar de novo.
 */
export async function executarTool(
  nome: string,
  argumentos: unknown,
  contexto: ContextoDaTool,
  signal?: AbortSignal,
): Promise<ResultadoDeTool> {
  try {
    return { conteudo: await despachar(nome, argumentos, contexto, signal), ehErro: false };
  } catch (e) {
    return { conteudo: JSON.stringify(descreverFalha(e)), ehErro: true };
  }
}

async function despachar(
  nome: string,
  argumentos: unknown,
  contexto: ContextoDaTool,
  signal?: AbortSignal,
): Promise<string> {
  switch (nome) {
    case 'buscar_filmes': {
      const input = BuscarFilmesInputSchema.parse(argumentos);

      return JSON.stringify({ candidatos: await buscarFilmes(input, signal) });
    }

    case 'detalhes_do_filme': {
      const input = DetalhesDoFilmeInputSchema.parse(argumentos);

      return JSON.stringify(await detalhesDoFilme(input));
    }

    case 'buscar_conexoes': {
      const input = BuscarConexoesInputSchema.parse(argumentos);

      return JSON.stringify({ conexoes: await buscarConexoes(input) });
    }

    case 'registrar_feedback': {
      const input = RegistrarFeedbackInputSchema.parse(argumentos);

      // A sessão é de quem está logado, não de quem o modelo disser que é.
      return JSON.stringify(
        await registrarFeedback({
          ...input,
          sessao_id: contexto.sessaoId,
          ...(contexto.perfilId !== null ? { perfil_id: contexto.perfilId } : {}),
        }),
      );
    }

    default:
      throw new AppError('tool_desconhecida', `tool "${nome}" não existe`);
  }
}

function descreverFalha(e: unknown): Record<string, unknown> {
  if (e instanceof FeedbackAmbiguoError) {
    return {
      erro: e.code,
      nada_foi_gravado: true,
      pergunte_a_curadora: e.pedidoDeEsclarecimento,
    };
  }

  if (e instanceof AppError) {
    return { erro: e.code, mensagem: e.message };
  }

  return { erro: 'falha_inesperada', mensagem: descreverErro(e) };
}
