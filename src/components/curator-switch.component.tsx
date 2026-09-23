'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CURATORS, curatorLabel } from '@/lib/curator.constant';

import type { CuratorName } from '@/lib/curator.constant';

/**
 * Who is using the tool right now, and a tap to change it.
 *
 * Not a login. The name is what every review in the dataset gets attributed
 * to, so it has to be visible at all times and cheap to correct — if Mirella
 * picks up a phone Sonia was holding, fixing that must be one tap, not a
 * sign-out flow.
 */
export function CuratorSwitch({ curator }: { curator: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function choose(name: CuratorName): Promise<void> {
    setSwitching(true);

    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ curator: name, password: '' }),
      });

      setOpen(false);
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="label-caps flex min-h-11 cursor-pointer items-center gap-2 px-1 text-signal-dim transition-colors hover:text-signal"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        {curatorLabel(curator)}
        <span aria-hidden="true" className="text-[8px]">
          ▼
        </span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Fechar"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => {
              setOpen(false);
            }}
          />
          <ul className="absolute right-0 z-20 mt-1 min-w-40 border border-seam-lit bg-panel">
            {CURATORS.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  disabled={switching}
                  className={`flex min-h-11 w-full cursor-pointer items-center px-4 text-left font-ui text-[15px] transition-colors hover:bg-recess ${
                    name === curator ? 'text-hal' : 'text-signal-dim'
                  }`}
                  onClick={() => void choose(name)}
                >
                  {curatorLabel(name)}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
