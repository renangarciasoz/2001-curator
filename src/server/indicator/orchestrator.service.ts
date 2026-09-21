import 'server-only';

import Anthropic from '@anthropic-ai/sdk';

import { describeError } from '@/lib/app-error.util';
import { METHOD_SYSTEM_PROMPT } from '@/method/system-prompt.constant';

import {
  CONVERSATION_MAX_TOKENS,
  FALLBACK_BETA,
  FALLBACK_MODEL,
  getAnthropicClient,
} from '../anthropic.service';
import { env } from '../env.config';
import { appendMessage, buildSessionContext, loadSession } from '../session.service';
import { INDICADOR_TOOLS } from '../tools/definitions.constant';
import { executeTool } from '../tools/execute-tool.service';

/**
 * Ceiling on tool round-trips within a single turn.
 *
 * Eight is generous for the Method (search → detail two or three → connections)
 * and short enough that a degenerate loop stops instead of burning tokens.
 */
const MAX_ITERATIONS = 8;

export type IndicadorEvent =
  | { kind: 'text'; delta: string }
  | { kind: 'tool'; name: string; state: 'start' | 'end'; error?: boolean }
  | { kind: 'refusal'; category: string | null }
  | { kind: 'end'; fullText: string }
  | { kind: 'error'; code: string; message: string };

/**
 * Drives one turn of the conversation between a curator and the Indicador.
 *
 * Emits events as they happen, so the interface can show the text being
 * written and say when the Indicador is consulting the archive. Every message —
 * the curator's, the Indicador's, and the tool results — is persisted as soon
 * as it exists: if the connection drops, the session resumes where it stopped.
 *
 * User-facing `message` fields are Portuguese; they are rendered verbatim in
 * the chat.
 */
export async function* converseWithIndicador(
  sessionId: string,
  curatorMessage: string,
  signal?: AbortSignal,
): AsyncGenerator<IndicadorEvent> {
  try {
    yield* drive(sessionId, curatorMessage, signal);
  } catch (e) {
    yield { kind: 'error', ...translateFailure(e) };
  }
}

async function* drive(
  sessionId: string,
  curatorMessage: string,
  signal?: AbortSignal,
): AsyncGenerator<IndicadorEvent> {
  const client = getAnthropicClient();
  const session = await loadSession(sessionId);
  const context = await buildSessionContext(session);

  const input: Anthropic.Beta.BetaContentBlockParam[] = [{ type: 'text', text: curatorMessage }];

  await appendMessage(sessionId, 'CURATOR', input);

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...session.history,
    { role: 'user', content: input },
  ];

  let fullText = '';

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const stream = client.beta.messages.stream(
      {
        model: env.ANTHROPIC_MODEL,
        max_tokens: CONVERSATION_MAX_TOKENS,
        betas: [FALLBACK_BETA],
        fallbacks: [{ model: FALLBACK_MODEL }],
        system: [
          // Stable prefix: the Method and the tools do not change between requests.
          { type: 'text', text: METHOD_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
          // Volatile: changes per session, so it sits after the cache breakpoint.
          { type: 'text', text: context },
        ],
        tools: INDICADOR_TOOLS,
        messages,
      },
      { signal: signal ?? null },
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;

        yield { kind: 'text', delta: event.delta.text };
      }
    }

    const response = await stream.finalMessage();

    await appendMessage(sessionId, 'INDICADOR', response.content);
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'refusal') {
      yield { kind: 'refusal', category: response.stop_details?.category ?? null };
      return;
    }

    // A server tool paused the turn: resending continues where it left off.
    if (response.stop_reason === 'pause_turn') {
      continue;
    }

    const calls = response.content.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use',
    );

    if (calls.length === 0) {
      yield { kind: 'end', fullText };
      return;
    }

    for (const call of calls) {
      yield { kind: 'tool', name: call.name, state: 'start' };
    }

    const results = await Promise.all(
      calls.map((call) =>
        executeTool(call.name, call.input, { sessionId, profileId: session.profileId }, signal),
      ),
    );

    const resultBlocks: Anthropic.Beta.BetaContentBlockParam[] = calls.map((call, position) => {
      const result = results[position];

      return {
        type: 'tool_result',
        tool_use_id: call.id,
        content: result?.content ?? '{"error":"result_lost"}',
        is_error: result?.isError ?? true,
      };
    });

    for (const [position, call] of calls.entries()) {
      yield {
        kind: 'tool',
        name: call.name,
        state: 'end',
        error: results[position]?.isError ?? true,
      };
    }

    // All results in a single message: splitting them teaches the model to stop
    // making parallel calls.
    await appendMessage(sessionId, 'CURATOR', resultBlocks);
    messages.push({ role: 'user', content: resultBlocks });
  }

  yield {
    kind: 'error',
    code: 'iteration_limit',
    message:
      'O Indicador consultou o acervo vezes demais sem concluir. Reformule o pedido em uma frase.',
  };
}

function translateFailure(e: unknown): { code: string; message: string } {
  if (e instanceof Anthropic.AuthenticationError) {
    return { code: 'invalid_credential', message: 'A chave da API não foi aceita.' };
  }

  if (e instanceof Anthropic.RateLimitError) {
    return {
      code: 'rate_limited',
      message: 'Limite de requisições atingido. Tente em instantes.',
    };
  }

  if (e instanceof Anthropic.APIError) {
    return {
      code: 'api_failure',
      message: `O Indicador não conseguiu responder (HTTP ${String(e.status ?? 0)}).`,
    };
  }

  console.error(`Conversation failed: ${describeError(e)}`);

  return { code: 'unexpected_failure', message: 'O Indicador não conseguiu responder agora.' };
}
