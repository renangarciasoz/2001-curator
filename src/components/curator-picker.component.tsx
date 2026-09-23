'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CURATORS, curatorLabel } from '@/lib/curator.constant';

import type { CuratorName } from '@/lib/curator.constant';

/**
 * The only thing standing between a curator and the tool: her own name.
 *
 * The name is a label, not a credential, but it is load-bearing — it decides
 * who every review in the dataset is attributed to, and without it the quality
 * gate cannot tell agreement from disagreement from a single reading. Hence two
 * large named targets, one tap, and then a year before the question is asked
 * again.
 *
 * `requiresPassword` comes from the server, which is the only side that knows
 * whether `APP_CURATION_PASSWORD` is set. Deciding it here would be a guess,
 * and guessing wrong hides a field the deployment demands — which is exactly
 * how this screen came to answer 401 forever on the public URL.
 */
export function CuratorPicker({ requiresPassword }: { requiresPassword: boolean }) {
  const router = useRouter();
  const [choosing, setChoosing] = useState<CuratorName | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function enter(curator: CuratorName): Promise<void> {
    setChoosing(curator);
    setError(null);

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ curator, password }),
      });

      if (!response.ok) {
        setError(
          response.status === 401
            ? 'Senha de curadoria incorreta.'
            : 'Não foi possível entrar. Tente de novo.',
        );
        setChoosing(null);
        return;
      }

      router.refresh();
    } catch {
      setError('A rede falhou. Tente de novo.');
      setChoosing(null);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center gap-3">
          <span className="monolith" aria-hidden="true" />
          <span className="font-display text-[15px] font-medium tracking-[0.34em] uppercase">
            Indicador <span className="text-hal">2001</span>
          </span>
        </div>

        <h1 className="mt-10 font-display text-[32px] leading-[1.1] font-light">
          Quem está indicando?
        </h1>

        {requiresPassword ? (
          <div className="mt-8">
            <label htmlFor="password" className="label-caps mb-2 block">
              Senha de curadoria
            </label>
            <input
              id="password"
              type="password"
              value={password}
              autoComplete="current-password"
              className="field font-mono tracking-widest"
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
            <p className="mt-2 font-mono text-[10px] tracking-wider text-signal-faint uppercase">
              Depois disso, trocar de nome não pede senha de novo
            </p>
          </div>
        ) : null}

        {error !== null ? (
          <p className="note note-alert mt-6" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-8 grid grid-cols-2 gap-px border border-seam bg-seam">
          {CURATORS.map((name) => (
            <button
              key={name}
              type="button"
              disabled={choosing !== null}
              className="cursor-pointer bg-panel px-4 py-10 transition-colors hover:bg-recess disabled:opacity-50"
              onClick={() => void enter(name)}
            >
              <span
                className={`font-display text-[22px] font-light tracking-[0.18em] uppercase ${
                  choosing === name ? 'text-hal' : 'text-signal'
                }`}
              >
                {curatorLabel(name)}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-6 font-mono text-[10px] tracking-wider text-signal-faint uppercase">
          Fica salvo neste aparelho — dá para trocar depois
        </p>
      </div>
    </main>
  );
}
