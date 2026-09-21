'use client';

import { useRef, useState } from 'react';

import { readSseEvents } from '@/lib/sse-events.util';

import { CorrectionPanel } from './correction-panel.component';

import type { TranscriptTurn } from '@/lib/transcript.type';

/** Mirrors `IndicadorEvent` from the orchestrator, on the browser side. */
type IndicadorEvent =
  | { kind: 'text'; delta: string }
  | { kind: 'tool'; name: string; state: 'start' | 'end'; error?: boolean }
  | { kind: 'refusal'; category: string | null }
  | { kind: 'end'; fullText: string }
  | { kind: 'error'; code: string; message: string };

const EVENT_KINDS = ['text', 'tool', 'refusal', 'end', 'error'] as const;

/**
 * Narrows an SSE payload to an orchestrator event.
 *
 * Deserialization boundary: the stream comes from this app's own route handler,
 * so checking the discriminant is enough. A payload with an unrecognised `kind`
 * is dropped rather than trusted — that is what a version skew between an open
 * tab and a redeployed server looks like.
 */
function toIndicadorEvent(payload: unknown): IndicadorEvent | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const kind: unknown = Reflect.get(payload, 'kind');
  const known = EVENT_KINDS.some((candidate) => candidate === kind);

  return known ? (payload as IndicadorEvent) : null;
}

/** Portuguese: shown to the curator while a tool runs. */
const TOOL_LABEL: Readonly<Record<string, string>> = {
  search_films: 'procurando no acervo',
  film_details: 'lendo a ficha',
  search_connections: 'consultando as pontes das curadoras',
  record_feedback: 'registrando a avaliação',
};

export function IndicatorChat({
  sessionId,
  curator,
  initialTranscript,
}: {
  sessionId: string;
  curator: string;
  initialTranscript: readonly TranscriptTurn[];
}) {
  const [turns, setTurns] = useState<readonly TranscriptTurn[]>(initialTranscript);
  const [draft, setDraft] = useState('');
  const [inFlight, setInFlight] = useState(false);
  const [tool, setTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const partial = useRef('');

  async function send(message: string): Promise<void> {
    setError(null);
    setInFlight(true);
    setReviewing(false);
    partial.current = '';

    setTurns((previous) => [
      ...previous,
      { author: 'CURATOR', text: message },
      { author: 'INDICADOR', text: '' },
    ]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, message }),
      });

      if (!response.ok || response.body === null) {
        setError('O Indicador não respondeu. Tente de novo.');
        return;
      }

      for await (const payload of readSseEvents(response.body)) {
        const event = toIndicadorEvent(payload);

        if (event !== null) {
          apply(event);
        }
      }
    } catch {
      setError('A conexão caiu no meio da conversa. O que já foi dito está salvo.');
    } finally {
      setInFlight(false);
      setTool(null);
    }
  }

  function apply(event: IndicadorEvent): void {
    switch (event.kind) {
      case 'text':
        partial.current += event.delta;
        replaceLastTurn(partial.current);
        break;

      case 'tool':
        setTool(event.state === 'start' ? (TOOL_LABEL[event.name] ?? event.name) : null);
        break;

      case 'refusal':
        setError('O Indicador não pôde responder a este pedido.');
        break;

      case 'end':
        replaceLastTurn(event.fullText);
        break;

      case 'error':
        setError(event.message);
        break;

      default: {
        const exhaustive: never = event;
        throw new Error(`unhandled event: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  function replaceLastTurn(text: string): void {
    setTurns((previous) => {
      const copy = [...previous];
      const last = copy.length - 1;

      if (copy[last]?.author === 'INDICADOR') {
        copy[last] = { author: 'INDICADOR', text };
      }

      return copy;
    });
  }

  const lastRequest = [...turns].reverse().find((turn) => turn.author === 'CURATOR')?.text ?? '';
  const lastRecommendation =
    [...turns].reverse().find((turn) => turn.author === 'INDICADOR')?.text ?? '';

  return (
    <>
      <div className="transcript">
        {turns.map((turn, position) => (
          <div
            // The transcript only grows at the end; the position is stable by construction.
            key={`${String(position)}-${turn.author}`}
            className={`turn ${turn.author === 'CURATOR' ? 'turn-curator' : 'turn-indicador'}`}
          >
            <span className="speaker">{turn.author === 'CURATOR' ? 'Você' : 'O Indicador'}</span>
            {turn.text}
          </div>
        ))}
      </div>

      {tool !== null ? <p className="tool-status">O Indicador está {tool}…</p> : null}

      {error !== null ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : null}

      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();

          const message = draft.trim();

          if (message.length === 0 || inFlight) {
            return;
          }

          setDraft('');
          void send(message);
        }}
      >
        <label htmlFor="message">Sua mensagem</label>
        <textarea
          id="message"
          value={draft}
          disabled={inFlight}
          placeholder="Traga um pedido real, ou teste uma persona de espectador."
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />

        <div className="actions">
          <button type="submit" disabled={inFlight || draft.trim().length === 0}>
            {inFlight ? 'O Indicador está pensando…' : 'Enviar'}
          </button>

          <button
            type="button"
            disabled={inFlight || lastRecommendation.length === 0}
            onClick={() => {
              setReviewing((open) => !open);
            }}
          >
            {reviewing ? 'Fechar avaliação' : 'Avaliar esta recomendação'}
          </button>
        </div>
      </form>

      {reviewing ? (
        <CorrectionPanel
          sessionId={sessionId}
          curator={curator}
          initialRequest={lastRequest}
          initialRecommendation={lastRecommendation}
          onRecorded={() => {
            setReviewing(false);
          }}
        />
      ) : null}
    </>
  );
}
