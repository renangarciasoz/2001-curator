'use client';

import { useState } from 'react';

import { CURATORS, curatorLabel } from '@/lib/curator.constant';
import { MIN_REASON_LENGTH } from '@/lib/quality-gate.util';

import type { CuratorName } from '@/lib/curator.constant';
import type { ReactNode } from 'react';

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
 * API directly. The layout follows that: the "why" field is the largest thing
 * on screen once a correction is marked.
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
      <section className="mt-10 border-t-2 border-ink pt-6">
        <p className="note note-done">{summary}</p>
        <div className="mt-5">
          <button type="button" className="btn btn-quiet" onClick={onRecorded}>
            Voltar à conversa
          </button>
        </div>
      </section>
    );
  }

  return (
    <form
      className="mt-10 border-t-2 border-ink pt-6"
      onSubmit={(event) => {
        event.preventDefault();
        void record();
      }}
    >
      <p className="label-caps mb-2">O ciclo de curadoria</p>
      <h2 className="font-display text-[26px] leading-tight tracking-tight">
        Avaliar a recomendação
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft text-pretty">
        O que vale aqui é o porquê. Uma correção sem justificativa não é gravada — é ela que
        ensina o modelo na Fase 2.
      </p>

      <div className="mt-7 space-y-5">
        <Field id="request" label="O que a pessoa queria" value={request} onChange={setRequest} />
        <Field
          id="questions"
          label="O que o Indicador perguntou antes de indicar — uma por linha, opcional"
          value={questions}
          onChange={setQuestions}
        />
        <Field
          id="recommendation"
          label="O que ele indicou"
          value={recommendation}
          rows={5}
          onChange={setRecommendation}
        />
      </div>

      <div className="mt-9 space-y-px border border-rule bg-rule">
        {CURATORS.map((name) => (
          <fieldset key={name} className="bg-paper-raised px-4 py-4">
            <Check
              checked={reviews[name].participates}
              disabled={name === curator}
              onChange={(checked) => {
                update(name, { participates: checked });
              }}
            >
              <span className="font-display text-[20px] leading-none">{curatorLabel(name)}</span>
              <span className="label-caps ml-2">
                avaliou{name === curator ? ' · você' : ''}
              </span>
            </Check>

            {reviews[name].participates ? (
              <div className="mt-4 border-l border-rule pl-4">
                <Check
                  checked={reviews[name].hasCorrection}
                  onChange={(checked) => {
                    update(name, { hasCorrection: checked });
                  }}
                >
                  <span className="text-[15px]">A indicação precisa de correção</span>
                </Check>

                {reviews[name].hasCorrection ? (
                  <div className="mt-4 space-y-4">
                    <Field
                      id={`correction-${name}`}
                      label={`O que ${curatorLabel(name)} indicaria no lugar`}
                      value={reviews[name].correction}
                      required
                      onChange={(value) => {
                        update(name, { correction: value });
                      }}
                    />
                    <Field
                      id={`reason-${name}`}
                      label="Por quê — o que a pessoa precisava e esta indicação não dava"
                      value={reviews[name].reason}
                      required
                      rows={4}
                      minLength={MIN_REASON_LENGTH}
                      onChange={(value) => {
                        update(name, { reason: value });
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </fieldset>
        ))}
      </div>

      {bothCorrected ? (
        <fieldset className="mt-8">
          <legend className="label-caps">As duas corrigiram. É a mesma leitura?</legend>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft text-pretty">
            Divergência não é problema: as duas leituras ficam registradas lado a lado, sem
            vencedora, e a conversa vai para revisão.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-px border border-rule bg-rule">
            {[
              { value: true, label: 'Mesma leitura' },
              { value: false, label: 'Leituras diferentes' },
            ].map((option) => (
              <label
                key={String(option.value)}
                className={`cursor-pointer px-4 py-3 text-center text-[15px] transition-colors ${
                  bothAgree === option.value
                    ? 'bg-accent-soft text-accent'
                    : 'bg-paper-raised text-ink-soft hover:text-ink'
                }`}
              >
                <input
                  type="radio"
                  name="agreement"
                  className="sr-only"
                  checked={bothAgree === option.value}
                  onChange={() => {
                    setBothAgree(option.value);
                  }}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {clarification !== null ? (
        <div className="note note-alert mt-8" role="alert">
          <p className="text-pretty">
            <strong className="font-semibold">Nada foi gravado.</strong> {clarification}
          </p>
          <button
            type="button"
            disabled={submitting}
            className="btn btn-quiet mt-4"
            onClick={() => void discard()}
          >
            Não quero detalhar — registrar como descartado
          </button>
        </div>
      ) : null}

      {error !== null ? (
        <p className="note note-alert mt-6" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={submitting || participants.length === 0}
          className="btn btn-primary"
        >
          {submitting ? 'Registrando…' : 'Registrar avaliação'}
        </button>
        <button type="button" disabled={submitting} className="btn btn-quiet" onClick={onRecorded}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  rows = 3,
  required = false,
  minLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  required?: boolean;
  minLength?: number | undefined;
}) {
  return (
    <div>
      <label htmlFor={id} className="label-caps mb-2 block">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        required={required}
        className="field resize-y"
        {...(minLength !== undefined ? { minLength } : {})}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}

function Check({
  checked,
  onChange,
  disabled = false,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex items-baseline gap-3 ${disabled ? '' : 'cursor-pointer'} ${
        checked ? 'text-ink' : 'text-ink-soft'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        className="size-4 shrink-0 translate-y-0.5 accent-accent"
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      <span>{children}</span>
    </label>
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
