'use client';

import { useState } from 'react';

import { CURATORS, curatorLabel } from '@/lib/curator.constant';

import type { CuratorName } from '@/lib/curator.constant';

/** Mirrors the minimum the server-side quality gate enforces. */
const MIN_REASON_LENGTH = 15;

type ReviewState = {
  participates: boolean;
  hasCorrection: boolean;
  correction: string;
  reason: string;
};

const EMPTY_REVIEW: ReviewState = {
  participates: false,
  hasCorrection: false,
  correction: '',
  reason: '',
};

/**
 * The correction interface.
 *
 * It exists for one thing: making sure no correction is recorded without its
 * reason. The validation here is convenience — the server's quality gate is
 * what decides, and the database has CHECK constraints for anyone calling the
 * API directly.
 */
export function CorrectionPanel({
  sessionId,
  curator,
  initialRequest,
  initialRecommendation,
  onRecorded,
}: {
  sessionId: string;
  curator: string;
  initialRequest: string;
  initialRecommendation: string;
  onRecorded: () => void;
}) {
  const [request, setRequest] = useState(initialRequest);
  const [recommendation, setRecommendation] = useState(initialRecommendation);
  const [questions, setQuestions] = useState('');

  const [reviews, setReviews] = useState<Record<CuratorName, ReviewState>>({
    SONIA: { ...EMPTY_REVIEW, participates: curator === 'SONIA' },
    MIRELLA: { ...EMPTY_REVIEW, participates: curator === 'MIRELLA' },
  });

  const [bothAgree, setBothAgree] = useState<boolean | null>(null);
  const [clarification, setClarification] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const participants = CURATORS.filter((name) => reviews[name].participates);
  const bothCorrected =
    participants.length === 2 && participants.every((name) => reviews[name].hasCorrection);

  function update(name: CuratorName, change: Partial<ReviewState>): void {
    setReviews((previous) => ({ ...previous, [name]: { ...previous[name], ...change } }));
  }

  async function record(): Promise<void> {
    setError(null);
    setClarification(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          user_request: request,
          ai_questions: questions
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
          ai_recommendation: recommendation,
          reviews: participants.map((name) => ({
            curator: name,
            has_correction: reviews[name].hasCorrection,
            correction: reviews[name].correction,
            reason: reviews[name].reason,
          })),
          ...(bothCorrected && bothAgree !== null ? { both_agree: bothAgree } : {}),
        }),
      });

      const body: unknown = await response.json();

      if (response.status === 422) {
        setClarification(readField(body, 'clarificationRequest') ?? 'Falta o porquê.');
        return;
      }

      if (!response.ok) {
        setError(readField(body, 'message') ?? 'Não foi possível registrar.');
        return;
      }

      setSummary(readField(body, 'summary') ?? 'Avaliação registrada.');
    } catch {
      setError('A rede falhou. Nada foi gravado — tente de novo.');
    } finally {
      setSubmitting(false);
    }
  }

  async function discard(): Promise<void> {
    setSubmitting(true);

    try {
      const response = await fetch('/api/feedback', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          user_request: request,
          ai_questions: [],
          ai_recommendation: recommendation,
          reviewed_by: curator,
          reason: clarification ?? 'porquê não detalhado',
        }),
      });

      if (!response.ok) {
        setError('Não foi possível registrar o descarte.');
        return;
      }

      setClarification(null);
      setSummary(
        'Registrado como descartado. A recomendação fica marcada como avaliada e não aproveitada.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (summary !== null) {
    return (
      <div className="panel">
        <p className="notice notice-ok">{summary}</p>
        <div className="actions">
          <button type="button" onClick={onRecorded}>
            Voltar à conversa
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        void record();
      }}
    >
      <h2>Avaliar a recomendação</h2>
      <p className="muted">
        O que vale aqui é o porquê. Uma correção sem justificativa não é gravada — é ela que
        ensina o modelo na Fase 2.
      </p>

      <label htmlFor="request">O que a pessoa queria</label>
      <textarea
        id="request"
        value={request}
        onChange={(event) => {
          setRequest(event.target.value);
        }}
      />

      <label htmlFor="questions">
        O que o Indicador perguntou antes de indicar (uma por linha, opcional)
      </label>
      <textarea
        id="questions"
        value={questions}
        onChange={(event) => {
          setQuestions(event.target.value);
        }}
      />

      <label htmlFor="recommendation">O que ele indicou</label>
      <textarea
        id="recommendation"
        value={recommendation}
        onChange={(event) => {
          setRecommendation(event.target.value);
        }}
      />

      {CURATORS.map((name) => (
        <fieldset key={name} className="group">
          <label className="choice">
            <input
              type="checkbox"
              checked={reviews[name].participates}
              disabled={name === curator}
              onChange={(event) => {
                update(name, { participates: event.target.checked });
              }}
            />
            {curatorLabel(name)} avaliou
            {name === curator ? ' (você)' : ''}
          </label>

          {reviews[name].participates ? (
            <>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={reviews[name].hasCorrection}
                  onChange={(event) => {
                    update(name, { hasCorrection: event.target.checked });
                  }}
                />
                A indicação precisa de correção
              </label>

              {reviews[name].hasCorrection ? (
                <>
                  <label htmlFor={`correction-${name}`}>
                    O que {curatorLabel(name)} indicaria no lugar
                  </label>
                  <textarea
                    id={`correction-${name}`}
                    required
                    value={reviews[name].correction}
                    onChange={(event) => {
                      update(name, { correction: event.target.value });
                    }}
                  />

                  <label htmlFor={`reason-${name}`}>
                    Por quê — o que a pessoa precisava e esta indicação não dava
                  </label>
                  <textarea
                    id={`reason-${name}`}
                    required
                    minLength={MIN_REASON_LENGTH}
                    value={reviews[name].reason}
                    onChange={(event) => {
                      update(name, { reason: event.target.value });
                    }}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </fieldset>
      ))}

      {bothCorrected ? (
        <fieldset className="group">
          <legend>As duas corrigiram. É a mesma leitura?</legend>
          <p className="muted">
            Divergência não é problema: as duas leituras ficam registradas lado a lado, sem
            vencedora, e a conversa vai para revisão.
          </p>

          <label className="choice">
            <input
              type="radio"
              name="agreement"
              checked={bothAgree === true}
              onChange={() => {
                setBothAgree(true);
              }}
            />
            Mesma leitura
          </label>

          <label className="choice">
            <input
              type="radio"
              name="agreement"
              checked={bothAgree === false}
              onChange={() => {
                setBothAgree(false);
              }}
            />
            Leituras diferentes
          </label>
        </fieldset>
      ) : null}

      {clarification !== null ? (
        <div className="notice" role="alert">
          <p>
            <strong>Nada foi gravado.</strong> {clarification}
          </p>
          <div className="actions">
            <button type="button" disabled={submitting} onClick={() => void discard()}>
              Não quero detalhar — registrar como descartado
            </button>
          </div>
        </div>
      ) : null}

      {error !== null ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="actions">
        <button type="submit" disabled={submitting || participants.length === 0}>
          {submitting ? 'Registrando…' : 'Registrar avaliação'}
        </button>
        <button type="button" disabled={submitting} onClick={onRecorded}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Reads a text field from a JSON response without trusting its shape. */
function readField(body: unknown, field: string): string | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const value: unknown = Reflect.get(body, field);

  return typeof value === 'string' ? value : null;
}
