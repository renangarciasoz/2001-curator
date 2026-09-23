'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { readSseEvents } from '@/lib/sse-events.util';
import { isArchiveTool } from '@/lib/transcript.type';

import { CorrectionPanel } from './correction-panel.component';

import type { Transcript, TranscriptTurn } from '@/lib/transcript.type';

/** Mirrors `IndicadorEvent` from the orchestrator, on the browser side. */
type IndicadorEvent =
  | { kind: 'text'; delta: string }
  | { kind: 'tool'; name: string; state: 'start' | 'end'; error?: boolean }
  | { kind: 'refusal'; category: string | null }
  | { kind: 'end'; fullText: string }
  | { kind: 'error'; code: string; message: string };

const EVENT_KINDS = ['text', 'tool', 'refusal', 'end', 'error'] as const;

/** Portuguese: shown to the curator while a tool runs. */
const TOOL_LABEL: Readonly<Record<string, string>> = {
  search_films: 'procurando no acervo',
  film_details: 'lendo a ficha',
  search_connections: 'consultando as pontes',
  record_feedback: 'registrando a avaliação',
};

export function IndicatorChat({
  sessionId: initialSessionId,
  curator,
  initialTranscript,
}: {
  sessionId: string | null;
  curator: string;
  initialTranscript: Transcript;
}) {
  const router = useRouter();

  const [sessionId, setSessionId] = useState(initialSessionId);
  const [persona, setPersona] = useState('');
  const [turns, setTurns] = useState<readonly TranscriptTurn[]>(initialTranscript.turns);
  const [draft, setDraft] = useState('');
  const [inFlight, setInFlight] = useState(false);
  const [tool, setTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [hasRecommended, setHasRecommended] = useState(initialTranscript.hasRecommended);

  const partial = useRef('');
  const bottom = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  // Follow the answer as it streams; a chat that does not scroll itself makes
  // the reader chase the text on a phone.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [turns, tool]);

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
      const id = sessionId ?? (await openSession());

      if (id === null) {
        setError('Não foi possível abrir a conversa.');
        return;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: id, message }),
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

      // Brings the rail up to date with the turn that just happened.
      router.refresh();
    } catch {
      setError('A conexão caiu no meio da conversa. O que já foi dito está salvo.');
    } finally {
      setInFlight(false);
      setTool(null);
    }
  }

  /**
   * A conversation is created by writing in it, not by pressing a button
   * first. Sessions opened and abandoned would otherwise pile up in the rail.
   */
  async function openSession(): Promise<string | null> {
    const named = persona.trim();

    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(named.length > 0 ? { userId: named } : {}),
    });

    if (!response.ok) {
      return null;
    }

    const body: unknown = await response.json();
    const id: unknown =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'sessionId') : null;

    if (typeof id !== 'string') {
      return null;
    }

    setSessionId(id);
    // Keeps the address bar honest without remounting and losing the stream.
    window.history.replaceState({}, '', `/chat/${id}`);

    return id;
  }

  function apply(event: IndicadorEvent): void {
    switch (event.kind) {
      case 'text':
        partial.current += event.delta;
        replaceLastTurn(partial.current);
        break;

      case 'tool':
        setTool(event.state === 'start' ? (TOOL_LABEL[event.name] ?? event.name) : null);

        // Reaching the archive is what turns a question into a recommendation,
        // and a recommendation is the only thing there is to review.
        if (isArchiveTool(event.name)) {
          setHasRecommended(true);
        }
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

  function submit(): void {
    const message = draft.trim();

    if (message.length === 0 || inFlight) {
      return;
    }

    setDraft('');

    if (composer.current !== null) {
      composer.current.style.height = 'auto';
    }

    void send(message);
  }

  const lastRequest = [...turns].reverse().find((turn) => turn.author === 'CURATOR')?.text ?? '';
  const lastRecommendation =
    [...turns].reverse().find((turn) => turn.author === 'INDICADOR')?.text ?? '';

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-4 sm:px-6">
        {turns.length === 0 ? (
          <div className="mt-6">
            <p className="text-[16px] leading-relaxed text-signal-dim text-pretty">
              Conte o que a pessoa precisa. O Indicador pergunta antes de indicar — é assim de
              propósito.
            </p>

            {sessionId === null ? (
              <div className="mt-8 max-w-sm">
                <label htmlFor="persona" className="label-caps mb-2 block">
                  Para quem é? (opcional)
                </label>
                <input
                  id="persona"
                  value={persona}
                  className="field"
                  placeholder="Nome ou apelido de quem vai assistir"
                  onChange={(event) => {
                    setPersona(event.target.value);
                  }}
                />
                <p className="mt-2 font-mono text-[10px] tracking-wider text-signal-faint uppercase">
                  Liga a conversa ao histórico dessa pessoa
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-7">
            {turns.map((turn, position) => (
              <article
                // The transcript only grows at the end; position is stable.
                key={`${String(position)}-${turn.author}`}
                className={`border-l-2 pl-4 sm:pl-5 ${
                  turn.author === 'CURATOR' ? 'border-seam' : 'border-hal'
                }`}
              >
                <p className="label-caps mb-1.5">
                  {turn.author === 'CURATOR' ? 'Você' : 'O Indicador'}
                </p>
                <div
                  className={`text-[16px] leading-[1.65] whitespace-pre-wrap sm:text-[17px] ${
                    turn.author === 'CURATOR' ? 'text-signal-dim' : 'text-signal'
                  }`}
                >
                  {turn.text}
                </div>
              </article>
            ))}
          </div>
        )}

        {tool !== null ? (
          <p className="mt-5 flex items-center gap-3 font-mono text-[11px] tracking-[0.16em] text-signal-dim uppercase">
            <span aria-hidden="true" className="hal-eye animate-pulse" />
            {tool}
          </p>
        ) : null}

        {error !== null ? (
          <p className="note note-alert mt-5" role="alert">
            {error}
          </p>
        ) : null}

        {reviewing ? (
          <CorrectionPanel
            sessionId={sessionId ?? ''}
            curator={curator}
            initialRequest={lastRequest}
            initialRecommendation={lastRecommendation}
            onRecorded={() => {
              setReviewing(false);
              router.refresh();
            }}
          />
        ) : null}

        <div ref={bottom} />
      </div>

      <div className="sticky bottom-0 border-t border-seam bg-space/95 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl px-4 py-3 sm:px-6">
          <div className="flex items-end gap-2">
            <textarea
              ref={composer}
              value={draft}
              rows={1}
              disabled={inFlight}
              aria-label="Sua mensagem"
              placeholder="Minha mãe perdeu o pai e quer chorar sem se destruir…"
              className="field max-h-40 resize-none disabled:opacity-60"
              onChange={(event) => {
                setDraft(event.target.value);

                // Grow with the text instead of hiding it behind a scrollbar.
                const field = event.currentTarget;
                field.style.height = 'auto';
                field.style.height = `${String(field.scrollHeight)}px`;
              }}
              onKeyDown={(event) => {
                // Enter sends on a keyboard; on a touch keyboard Enter has to
                // stay a line break, or writing two paragraphs is impossible.
                const hasKeyboard = window.matchMedia('(pointer: fine)').matches;

                if (event.key === 'Enter' && !event.shiftKey && hasKeyboard) {
                  event.preventDefault();
                  submit();
                }
              }}
            />

            <button
              type="button"
              aria-label="Enviar"
              disabled={inFlight || draft.trim().length === 0}
              className="btn btn-primary shrink-0 px-4"
              onClick={submit}
            >
              {inFlight ? '…' : '→'}
            </button>
          </div>

          {hasRecommended && !inFlight ? (
            <button
              type="button"
              className="label-caps mt-2 cursor-pointer transition-colors hover:text-hal"
              onClick={() => {
                setReviewing((open) => !open);
              }}
            >
              {reviewing ? 'Fechar avaliação' : 'Avaliar esta recomendação'}
            </button>
          ) : null}

          {!hasRecommended && turns.length > 0 && !inFlight ? (
            <p className="mt-2 font-mono text-[10px] tracking-wider text-signal-faint uppercase">
              A avaliação abre quando houver uma indicação
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

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
