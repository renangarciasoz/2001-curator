'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CURATORS, curatorLabel } from '@/lib/curator.constant';

import type { CuratorName } from '@/lib/curator.constant';

/**
 * The only thing standing between a curator and the tool: her own name.
 *
 * There is no password. This is not a door — it is a label. But the label is
 * load-bearing: it decides who every review in the dataset is attributed to,
 * and without it the quality gate cannot tell agreement from disagreement from
 * a single reading. Hence two large named targets, one tap, and then a year
 * before the question is asked again.
 */
export function CuratorPicker() {
  const router = useRouter();
  const [choosing, setChoosing] = useState<CuratorName | null>(null);

  async function enter(curator: CuratorName): Promise<void> {
    setChoosing(curator);

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ curator, password: '' }),
      });

      if (!response.ok) {
        setChoosing(null);
        return;
      }

      router.refresh();
    } catch {
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
