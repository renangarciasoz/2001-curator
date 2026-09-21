'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CURATORS, curatorLabel } from '@/lib/curator.constant';

import type { CuratorName } from '@/lib/curator.constant';

/**
 * A login that only has to do one thing: tell Sonia from Mirella.
 *
 * That distinction is not interface comfort — it is what makes every review
 * traceable. Without it the quality gate cannot tell agreement from
 * disagreement from a single reading. Hence two big named choices rather than
 * a dropdown: picking the wrong one corrupts attribution in the dataset.
 */
export function CuratorPicker({ requiresPassword }: { requiresPassword: boolean }) {
  const router = useRouter();
  const [curator, setCurator] = useState<CuratorName>('SONIA');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function signIn(): Promise<void> {
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ curator, password }),
      });

      if (!response.ok) {
        setError('Não foi possível entrar. Confira a senha de curadoria.');
        return;
      }

      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void signIn();
      }}
    >
      <fieldset>
        <legend className="label-caps mb-3">Quem está entrando</legend>

        <div className="grid grid-cols-2 gap-px border border-rule bg-rule">
          {CURATORS.map((name) => (
            <label
              key={name}
              className={`cursor-pointer px-4 py-5 text-center transition-colors ${
                curator === name
                  ? 'bg-accent-soft text-accent'
                  : 'bg-paper-raised text-ink-soft hover:text-ink'
              }`}
            >
              <input
                type="radio"
                name="curator"
                value={name}
                checked={curator === name}
                className="sr-only"
                onChange={() => {
                  setCurator(name);
                }}
              />
              <span className="font-display text-[26px] leading-none">{curatorLabel(name)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {requiresPassword ? (
        <div className="mt-6">
          <label htmlFor="password" className="label-caps mb-2 block">
            Senha de curadoria
          </label>
          <input
            id="password"
            type="password"
            value={password}
            autoComplete="current-password"
            className="field"
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </div>
      ) : null}

      {error !== null ? (
        <p className="note note-alert mt-6" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-8">
        <button type="submit" disabled={submitting} className="btn btn-primary">
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </form>
  );
}
