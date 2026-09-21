import 'server-only';

import Anthropic from '@anthropic-ai/sdk';

import { descreverErro } from '@/lib/app-error.util';
import { SYSTEM_PROMPT_DO_METODO } from '@/method/system-prompt.constant';

import {
  BETA_DE_FALLBACK,
  MAX_TOKENS_DA_CONVERSA,
  MODELO_DE_FALLBACK,
  obterClienteAnthropic,
} from '../anthropic.service';
import { env } from '../env.config';
import { carregarSessao, gravarMensagem, montarContextoDaSessao } from '../sessao.service';
import { TOOLS_DO_INDICADOR } from '../tools/definicoes.constant';
import { executarTool } from '../tools/executar-tool.service';

/**
 * Teto de idas e voltas com ferramentas num único turno.
 *
 * Oito é folgado para o Método (buscar → detalhar duas ou três → conexões) e
 * curto o bastante para que um laço degenerado pare em vez de queimar tokens.
 */
const MAXIMO_DE_ITERACOES = 8;

export type EventoDoIndicador =
  | { tipo: 'texto'; delta: string }
  | { tipo: 'ferramenta'; nome: string; estado: 'inicio' | 'fim'; erro?: boolean }
  | { tipo: 'recusa'; categoria: string | null }
  | { tipo: 'fim'; textoCompleto: string }
  | { tipo: 'erro'; codigo: string; mensagem: string };

/**
 * Conduz um turno da conversa entre a curadora e o Indicador.
 *
 * Emite eventos conforme acontecem, para que a interface mostre o texto sendo
 * escrito e diga quando o Indicador está consultando o acervo. Cada mensagem —
 * da curadora, do Indicador, e os resultados de ferramenta — é persistida assim
 * que existe: se a conexão cair no meio, a sessão continua de onde parou.
 */
export async function* conversarComOIndicador(
  sessaoId: string,
  mensagemDaCuradora: string,
  signal?: AbortSignal,
): AsyncGenerator<EventoDoIndicador> {
  try {
    yield* conduzir(sessaoId, mensagemDaCuradora, signal);
  } catch (e) {
    yield { tipo: 'erro', ...traduzirFalha(e) };
  }
}

async function* conduzir(
  sessaoId: string,
  mensagemDaCuradora: string,
  signal?: AbortSignal,
): AsyncGenerator<EventoDoIndicador> {
  const cliente = obterClienteAnthropic();
  const sessao = await carregarSessao(sessaoId);
  const contexto = await montarContextoDaSessao(sessao);

  const entrada: Anthropic.Beta.BetaContentBlockParam[] = [
    { type: 'text', text: mensagemDaCuradora },
  ];

  await gravarMensagem(sessaoId, 'CURADORA', entrada);

  const mensagens: Anthropic.Beta.BetaMessageParam[] = [
    ...sessao.historico,
    { role: 'user', content: entrada },
  ];

  let textoCompleto = '';

  for (let iteracao = 0; iteracao < MAXIMO_DE_ITERACOES; iteracao += 1) {
    const stream = cliente.beta.messages.stream(
      {
        model: env.ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS_DA_CONVERSA,
        betas: [BETA_DE_FALLBACK],
        fallbacks: [{ model: MODELO_DE_FALLBACK }],
        system: [
          // Prefixo estável: Método e ferramentas não mudam entre requests.
          { type: 'text', text: SYSTEM_PROMPT_DO_METODO, cache_control: { type: 'ephemeral' } },
          // Volátil: muda a cada sessão, então fica depois do ponto de cache.
          { type: 'text', text: contexto },
        ],
        tools: TOOLS_DO_INDICADOR,
        messages: mensagens,
      },
      { signal: signal ?? null },
    );

    for await (const evento of stream) {
      if (evento.type === 'content_block_delta' && evento.delta.type === 'text_delta') {
        textoCompleto += evento.delta.text;

        yield { tipo: 'texto', delta: evento.delta.text };
      }
    }

    const resposta = await stream.finalMessage();

    await gravarMensagem(sessaoId, 'INDICADOR', resposta.content);
    mensagens.push({ role: 'assistant', content: resposta.content });

    if (resposta.stop_reason === 'refusal') {
      yield { tipo: 'recusa', categoria: resposta.stop_details?.category ?? null };
      return;
    }

    // Ferramenta de servidor pausou o turno: reenviar continua de onde parou.
    if (resposta.stop_reason === 'pause_turn') {
      continue;
    }

    const chamadas = resposta.content.filter(
      (bloco): bloco is Anthropic.Beta.BetaToolUseBlock => bloco.type === 'tool_use',
    );

    if (chamadas.length === 0) {
      yield { tipo: 'fim', textoCompleto };
      return;
    }

    for (const chamada of chamadas) {
      yield { tipo: 'ferramenta', nome: chamada.name, estado: 'inicio' };
    }

    const resultados = await Promise.all(
      chamadas.map((chamada) =>
        executarTool(
          chamada.name,
          chamada.input,
          { sessaoId, perfilId: sessao.perfilId },
          signal,
        ),
      ),
    );

    const blocosDeResultado: Anthropic.Beta.BetaContentBlockParam[] = chamadas.map(
      (chamada, posicao) => {
        const resultado = resultados[posicao];

        return {
          type: 'tool_result',
          tool_use_id: chamada.id,
          content: resultado?.conteudo ?? '{"erro":"resultado_perdido"}',
          is_error: resultado?.ehErro ?? true,
        };
      },
    );

    for (const [posicao, chamada] of chamadas.entries()) {
      yield {
        tipo: 'ferramenta',
        nome: chamada.name,
        estado: 'fim',
        erro: resultados[posicao]?.ehErro ?? true,
      };
    }

    // Todos os resultados numa única mensagem: separá-los ensina o modelo a
    // parar de paralelizar chamadas.
    await gravarMensagem(sessaoId, 'CURADORA', blocosDeResultado);
    mensagens.push({ role: 'user', content: blocosDeResultado });
  }

  yield {
    tipo: 'erro',
    codigo: 'limite_de_iteracoes',
    mensagem:
      'O Indicador consultou o acervo vezes demais sem concluir. Reformule o pedido em uma frase.',
  };
}

function traduzirFalha(e: unknown): { codigo: string; mensagem: string } {
  if (e instanceof Anthropic.AuthenticationError) {
    return { codigo: 'credencial_invalida', mensagem: 'A chave da API não foi aceita.' };
  }

  if (e instanceof Anthropic.RateLimitError) {
    return { codigo: 'limite_de_taxa', mensagem: 'Limite de requisições atingido. Tente em instantes.' };
  }

  if (e instanceof Anthropic.APIError) {
    return {
      codigo: 'falha_da_api',
      mensagem: `O Indicador não conseguiu responder (HTTP ${String(e.status ?? 0)}).`,
    };
  }

  console.error(`Falha na conversa: ${descreverErro(e)}`);

  return { codigo: 'falha_inesperada', mensagem: 'O Indicador não conseguiu responder agora.' };
}
