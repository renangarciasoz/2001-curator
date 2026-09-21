import Link from 'next/link';

import { curatorLabel } from '@/lib/curator.constant';

import { SignOut } from './sign-out.component';

import type { ReactNode } from 'react';

/**
 * The masthead and reading column every page sits in.
 *
 * `prose` caps the measure at roughly 70 characters, which is where long
 * curatorial text stops being comfortable. `wide` exists for the dataset, the
 * one view that is scanned rather than read.
 */
export function PageShell({
  curator,
  eyebrow,
  title,
  lede,
  width = 'prose',
  children,
}: {
  curator?: string | undefined;
  eyebrow?: string | undefined;
  title: string;
  lede?: ReactNode;
  width?: 'prose' | 'wide';
  children: ReactNode;
}) {
  return (
    <div
      className={`mx-auto w-full px-6 pt-7 pb-28 sm:px-10 ${
        width === 'wide' ? 'max-w-5xl' : 'max-w-2xl'
      }`}
    >
      <header className="mb-12 flex items-center justify-between gap-4 border-b border-seam pb-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="monolith" aria-hidden="true" />
          <span className="font-display text-[15px] font-medium tracking-[0.34em] uppercase">
            Indicador <span className="text-hal">2001</span>
          </span>
        </Link>

        {curator !== undefined ? (
          <div className="flex items-center gap-5">
            <span className="label-caps">{curatorLabel(curator)}</span>
            <SignOut />
          </div>
        ) : null}
      </header>

      <main>
        {eyebrow !== undefined ? <p className="label-caps mb-4">{eyebrow}</p> : null}

        <h1 className="font-display text-[40px] leading-[1.05] font-light tracking-[-0.01em] text-balance">
          {title}
        </h1>

        {lede !== undefined ? (
          <div className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-signal-dim text-pretty">
            {lede}
          </div>
        ) : null}

        <div className="mt-10">{children}</div>
      </main>
    </div>
  );
}
