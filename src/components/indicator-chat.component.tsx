'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { readSseEvents } from '@/lib/sse-events.util';
import { isRecommendationTool } from '@/lib/transcript.type';

import { AutoTextarea } from './auto-textarea.component';
import { CorrectionPanel } from './correction-panel.component';
import { ThreeFilmsForm } from './three-films-form.component';

import type { Transcript, TranscriptTurn } from '@/lib/transcript.type';

/** Mirrors `IndicadorEvent` from the orchestrator, on the browser side. */
type IndicadorEvent =
  | { kind: 'text'; delta: string }
  | { kind: 'tool'; name: string; state: 'start' | 'end'; error?: boolean }
  | { kind: 'refusal'; category: string | null }
  | { kind: 'end'; fullText: string }
  | { kind: 'error'; code: string; message: string };

const EVENT_KINDS = ['text', 'tool', 'refusal', 'end', 'error'] as const;

/**
 * How long silence is allowed to last before the turn is treated as lost.
 *
 * The route sends a heartbeat every 15 seconds, so this is three missed beats:
 * long enough that a slow tool call is never mistaken for a dead connection,
 * short enough that nobody sits in front of a frozen screen wondering.
 */
const SILENCE_LIMIT_MS = 50_000;

/** Matches `maxDuration` on the chat route. Past it the function is gone anyway. */
const TURN_LIMIT_MS = 300_000;

/** Why a turn ended early — each one deserves a different sentence. */
type Interruption = 'curator' | 'silence' | 'ceiling';

function explainInterruption(reason: Interruption | null): string | null {
  switch (reason) {
    case 'curator':
      // They stopped it on purpose. Reporting that back as an error would be
      // the interface arguing with the person using it.
      return null;

    case 'silence':
      return 'O Indicador parou de responder no meio. O que chegou está salvo — pode enviar de novo.';

    case 'ceiling':
      return 'A resposta passou de cinco minutos e foi interrompida. Tente pedir de forma mais direta.';

    default:
      return 'A conexão caiu no meio da conversa. O que já foi dito está salvo.';
  }
}

/** Portuguese: shown to the curator while a tool runs. */
const TOOL_LABEL: Readonly<Record<string, string>> = {
  search_films: 'procurando no acervo',
  film_details: 'lendo a ficha',
  search_connections: 'consultando as pontes',
  search_releases: 'vendo o que está em cartaz',
  record_feedback: 'registrando a avaliação',
};

export function IndicatorChat({
  sessionId: initialSessionId,
  curator,
  initialTranscript,
  personaName = null,
}: {
  sessionId: string | null;
  curator: string;
  initialTranscript: Transcript;
  /** The viewer this conversation is attached to, when it is attached to one. */
  personaName?: string | null;
}) {
  const router = useRouter();

  const [sessionId, setSessionId] = useState(initialSessionId);
  const [attachedPersona, setAttachedPersona] = useState(personaName);
  const [namingPersona, setNamingPersona] = useState(false);
  const [persona, setPersona] = useState('');
  const [turns, setTurns] = useState<readonly TranscriptTurn[]>(initialTranscript.turns);
  const [draft, setDraft] = useState('');
  const [inFlight, setInFlight] = useState(false);
  const [tool, setTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toolFailure, setToolFailure] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [hasRecommended, setHasRecommended] = useState(initialTranscript.hasRecommended);

  const partial = useRef('');
  const attempt = useRef<{ controller: AbortController; reason: Interruption | null } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  /*
    Follow the answer as it streams.

    This drives the scroll container directly instead of calling
    `scrollIntoView` on a sentinel element. `scrollIntoView` aligns against the
    nearest scrollport and stops early when the content is still growing — with
    a streaming answer that means the text runs off the bottom and stays there.
    Setting `scrollTop` to `scrollHeight` has no such ambiguity.
  */
  useEffect(() => {
    const area = scroller.current;

    if (area !== null) {
      area.scrollTop = area.scrollHeight;
    }
  }, [turns, tool]);

  // The review panel opens below the fold. Without this the button looks like
  // it did nothing — and it is the button the whole dataset depends on. Its
  // *top* is what has to be on screen: it is a form to fill from the start,
  // not a message to catch up with.
  useEffect(() => {
    if (reviewing) {
      panel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [reviewing]);

  // Leaving the page mid-turn: stop the model instead of leaving it answering
  // into a stream nobody will read. Runs once, on unmount.
  useEffect(
    () => () => {
      attempt.current?.controller.abort();
    },
    [],
  );

  /**
   * One turn, with three independent ways out.
   *
   * The previous version had none, and the `finally` that clears `inFlight`
   * only runs once the stream loop ends. A server that stops sending without
   * closing the connection — a killed function, a proxy holding a half-open
   * socket — left the composer disabled and "pensando" on screen forever, with
   * a page reload as the only escape.
   *
   * So: the curator can stop it, silence longer than a few heartbeats stops it,
   * and a ceiling matching the route's `maxDuration` stops it regardless. All
   * three are the same `AbortController`, which also reaches the server through
   * `request.signal` and stops the model rather than leaving it running for
   * nobody.
   */
  async function send(message: string): Promise<void> {
    setError(null);
    setToolFailure(null);
    setInFlight(true);
    setReviewing(false);
    partial.current = '';

    setTurns((previous) => [
      ...previous,
      { author: 'CURATOR', text: message },
      { author: 'INDICADOR', text: '' },
    ]);

    const controller = new AbortController();

    attempt.current = { controller, reason: null };

    let idle: ReturnType<typeof setTimeout> | undefined;

    // Reset by every payload, heartbeats included — which is what makes a long
    // silent tool call different from a dead connection.
    const expectSomething = (): void => {
      clearTimeout(idle);

      idle = setTimeout(() => {
        if (attempt.current !== null) {
          attempt.current.reason = 'silence';
        }

        controller.abort();
      }, SILENCE_LIMIT_MS);
    };

    const ceiling = setTimeout(() => {
      if (attempt.current !== null) {
        attempt.current.reason = 'ceiling';
      }

      controller.abort();
    }, TURN_LIMIT_MS);

    try {
      expectSomething();

      const id = sessionId ?? (await openSession(controller.signal));

      if (id === null) {
        setError('Não foi possível abrir a conversa. Tente de novo.');
        forgetEmptyAnswer();
        setDraft(message);
        return;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: id, message }),
        signal: controller.signal,
      });

      if (!response.ok || response.body === null) {
        setError('O Indicador não respondeu. Tente de novo.');
        forgetEmptyAnswer();
        setDraft(message);
        return;
      }

      for await (const payload of readSseEvents(response.body)) {
        expectSomething();

        const event = toIndicadorEvent(payload);

        if (event !== null) {
          apply(event);
        }
      }

      // A stream that closed politely without ever saying anything is still a
      // failed turn — and the only one that would otherwise leave no trace on
      // screen at all, just an empty bubble and a composer back to normal.
      if (partial.current.length === 0) {
        setError((previous) => previous ?? 'O Indicador não chegou a responder. Tente de novo.');
        forgetEmptyAnswer();
        setDraft(message);
      }

      // Brings the rail up to date with the turn that just happened.
      router.refresh();
    } catch {
      setError(explainInterruption(attempt.current?.reason ?? null));
      forgetEmptyAnswer();

      // Retyping a message that was never answered is pure loss. Only when
      // nothing arrived: once there is an answer on screen, putting the
      // question back in the composer would be confusing rather than helpful.
      if (partial.current.length === 0) {
        setDraft(message);
      }

      router.refresh();
    } finally {
      clearTimeout(idle);
      clearTimeout(ceiling);
      attempt.current = null;
      setInFlight(false);
      setTool(null);
    }
  }

  /** Stops the turn in flight. The server hears about it through the signal. */
  function stop(): void {
    if (attempt.current !== null) {
      attempt.current.reason = 'curator';
      attempt.current.controller.abort();
    }
  }

  /**
   * Removes the placeholder answer when the turn produced no text.
   *
   * An empty bubble labelled "O Indicador" reads as a reply that said nothing,
   * which is a worse account of what happened than no bubble at all.
   */
  function forgetEmptyAnswer(): void {
    setTurns((previous) => {
      const last = previous.at(-1);

      return last?.author === 'INDICADOR' && last.text.length === 0
        ? previous.slice(0, -1)
        : previous;
    });
  }

  /**
   * A conversation is created by writing in it, not by pressing a button
   * first. Sessions opened and abandoned would otherwise pile up in the rail.
   */
  async function openSession(signal: AbortSignal): Promise<string | null> {
    const named = persona.trim();

    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(named.length > 0 ? { userId: named } : {}),
      signal,
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

    if (named.length > 0) {
      setAttachedPersona(named);
    }

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

        // A failed tool used to be invisible here: the model would explain, in
        // prose, that the archive was unreachable, and the curator had no way
        // to tell a broken service from the Indicador being careful.
        if (event.state === 'end' && event.error === true) {
          setToolFailure(event.name);
          break;
        }

        // Looking something up is what turns a question into a recommendation,
        // and a recommendation is the only thing there is to review. A failed
        // search looked nothing up — hence the early break above.
        if (isRecommendationTool(event.name)) {
          setHasRecommended(true);
        }
        break;

      case 'refusal':
        setError('O Indicador não pôde responder a este pedido.');
        break;

      case 'end':
        // Kept in the ref too: it is what tells the caller the turn produced
        // an answer, and a reply that arrived whole rather than in deltas
        // would otherwise look like silence.
        partial.current = event.fullText;
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

    // Clearing the draft is enough: the composer resizes off the value.
    setDraft('');

    void send(message);
  }

  const lastRequest = [...turns].reverse().find((turn) => turn.author === 'CURATOR')?.text ?? '';
  const lastRecommendation =
    [...turns].reverse().find((turn) => turn.author === 'INDICADOR')?.text ?? '';

  /**
   * What is happening right now, in one line.
   *
   * A running tool is the most specific thing we can say, so it wins. Otherwise
   * the turn is with the model: either it has not started writing (the wait
   * that used to look like a crash) or it is writing, and the caret in the text
   * already says that — so the line stays general rather than contradicting it.
   */
  const status = ((): string | null => {
    if (tool !== null) {
      return tool;
    }

    if (!inFlight) {
      return null;
    }

    const answering = turns.at(-1);

    return answering?.author === 'INDICADOR' && answering.text.length > 0
      ? 'escrevendo'
      : 'pensando';
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-6 sm:px-6">
          {/*
            Whose history this conversation is attached to. It used to be
            visible only while typing the first message, which meant that for
            the whole rest of the conversation nothing on screen said which
            person the Indicador was remembering.
          */}
          {attachedPersona !== null ? (
            <p className="mb-6 flex items-center gap-2 border-l-2 border-seam-lit pl-3">
              <span className="label-caps">Para</span>
              <span className="font-ui text-[14px] text-signal">{attachedPersona}</span>
            </p>
          ) : null}

          {turns.length === 0 ? (
            <div className="mt-2">
              <ThreeFilmsForm
                disabled={inFlight}
                onSubmit={(message) => {
                  void send(message);
                }}
              />

              {/*
                Folded away by default. Naming a persona is useful and rare —
                it buys memory between visits — but an empty field sitting
                between the curator and the only thing she came to do made the
                screen read as a form.
              */}
              {sessionId === null ? (
                <div className="mt-8">
                  {namingPersona ? (
                    <div className="max-w-sm">
                      <label htmlFor="persona" className="label-caps mb-2 block">
                        Para quem é?
                      </label>
                      <input
                        id="persona"
                        value={persona}
                        autoFocus
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
                  ) : (
                    <button
                      type="button"
                      className="label-caps cursor-pointer transition-colors hover:text-hal"
                      onClick={() => {
                        setNamingPersona(true);
                      }}
                    >
                      + Dizer para quem é
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-7">
              {turns.map((turn, position) => {
                const isLast = position === turns.length - 1;

                return (
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
                      {/* The text is arriving; the caret says so without a spinner. */}
                      {inFlight && isLast && turn.author === 'INDICADOR' && turn.text.length > 0 ? (
                        <span aria-hidden="true" className="caret" />
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/*
            One activity line for the whole turn, never absent while a turn is
            in flight. Before this, the gap between pressing send and the first
            token showed nothing at all — the longest part of a turn, and the
            part that read as a freeze.
          */}
          {status !== null ? (
            <p
              aria-live="polite"
              className="mt-5 flex items-center gap-3 font-mono text-[11px] tracking-[0.16em] text-signal-dim uppercase"
            >
              <span aria-hidden="true" className="hal-eye animate-pulse" />
              {status}
            </p>
          ) : null}

          {error !== null ? (
            <p className="note note-alert mt-5" role="alert">
              {error}
            </p>
          ) : null}

          {toolFailure !== null ? (
            <div className="note note-alert mt-5" role="alert">
              <p className="text-pretty">
                <strong className="font-semibold">O acervo não respondeu.</strong> A ferramenta{' '}
                <code className="font-mono text-[13px]">{toolFailure}</code> falhou, então esta
                resposta não vem do acervo da 2001 — não avalie como se viesse.
              </p>
              <p className="mt-2 font-mono text-[11px] tracking-wider text-signal-faint uppercase">
                Rode `pnpm check:services` para ver qual serviço caiu
              </p>
            </div>
          ) : null}

          {/*
          The way into the dataset. It sits right under the recommendation it
          is about — under the composer it read as a footnote, and a curator
          who cannot find this button is a curator whose reasons never get
          recorded, which is the entire point of the tool.
        */}
          {hasRecommended && !inFlight && !reviewing ? (
            <div className="mt-8 border-t border-seam pt-6">
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  setReviewing(true);
                }}
              >
                Avaliar esta indicação
              </button>
              <p className="mt-3 text-[14px] leading-relaxed text-signal-faint text-pretty">
                Corrigir aqui — com o porquê — é o que vira dado da 2001.
              </p>
            </div>
          ) : null}

          <div ref={panel}>
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
          </div>
        </div>
      </div>

      {/*
        Hidden while reviewing: the panel is a long form with its own buttons,
        and on a phone a pinned composer would eat a third of the screen to
        offer something nobody is doing right then.

        `pb-[env(safe-area-inset-bottom)]` lives here rather than on `body`:
        the shell is exactly `h-dvh`, so padding on the body would push it off
        the screen by the size of the home bar.
      */}
      <div
        hidden={reviewing}
        className="shrink-0 border-t border-seam pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto w-full max-w-2xl px-4 py-3 sm:px-6">
          <div className="flex items-end gap-2">
            <AutoTextarea
              value={draft}
              disabled={inFlight}
              aria-label="Sua mensagem"
              /*
                Short on purpose: the box is one row tall until something is
                typed, so a placeholder that wraps is a placeholder that is
                cut in half on a phone. The empty state above carries the
                longer explanation.
              */
              placeholder="Ou escreva direto…"
              className="field max-h-40 resize-none disabled:opacity-60"
              onChange={(event) => {
                setDraft(event.target.value);
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

            {/*
              While a turn is in flight this is a stop button, not a disabled
              send button. A disabled control is a dead end: it was the only
              thing on screen when the stream hung, and it offered the curator
              nothing to do about it.
            */}
            {inFlight ? (
              <button
                type="button"
                aria-label="Parar"
                className="btn btn-quiet shrink-0 gap-2 px-4"
                onClick={stop}
              >
                <span aria-hidden="true" className="spinner" />
                Parar
              </button>
            ) : (
              <button
                type="button"
                aria-label="Enviar"
                disabled={draft.trim().length === 0}
                className="btn btn-primary shrink-0 px-4"
                onClick={submit}
              >
                →
              </button>
            )}
          </div>

          {!hasRecommended && turns.length > 0 && !inFlight ? (
            <p className="mt-2 font-mono text-[10px] tracking-wider text-signal-faint uppercase">
              Ainda perguntando — a avaliação abre quando ele indicar
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
