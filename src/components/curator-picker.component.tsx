'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CURATORS, curatorLabel, isCurator } from '@/lib/curator.constant';

import type { CuratorName } from '@/lib/curator.constant';

/**
 * A login that only has to do one thing: tell Sonia from Mirella.
 *
 * That distinction is not interface comfort — it is what makes every review
 * traceable. Without it the quality gate cannot tell agreement from
 * disagreement from a single reading.
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
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        void signIn();
      }}
    >
      <label htmlFor="curator">Quem está entrando</label>
      <select
        id="curator"
        value={curator}
        onChange={(event) => {
          if (isCurator(event.target.value)) {
            setCurator(event.target.value);
          }
        }}
      >
        {CURATORS.map((name) => (
          <option key={name} value={name}>
            {curatorLabel(name)}
          </option>
        ))}
      </select>

      {requiresPassword ? (
        <>
          <label htmlFor="password">Senha de curadoria</label>
          <input
            id="password"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </>
      ) : null}

      {error !== null ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="actions">
        <button type="submit" disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </form>
  );
}
