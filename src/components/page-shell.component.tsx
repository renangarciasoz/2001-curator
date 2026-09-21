import Link from 'next/link';

import { curatorLabel } from '@/lib/curator.constant';

import { SignOut } from './sign-out.component';

import type { ReactNode } from 'react';

/**
 * The masthead and reading column every page sits in.
 *
 * `prose` caps the measure at roughly 70 characters, which is where long
 * curatorial text stops being comfortable. `wide` exists for the dataset table,
 * the one view that is scanned rather than read.
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
      className={`mx-auto w-full px-6 pt-8 pb-28 sm:px-8 ${
        width === 'wide' ? 'max-w-5xl' : 'max-w-2xl'
      }`}
    >
      <header className="mb-10 flex items-baseline justify-between gap-4 border-b border-rule pb-3">
        <Link href="/" className="font-display text-[26px] leading-none tracking-tight">
          Indicador <span className="text-accent">2001</span>
        </Link>

        {curator !== undefined ? (
          <div className="flex items-baseline gap-4">
            <span className="label-caps">{curatorLabel(curator)}</span>
            <SignOut />
          </div>
        ) : null}
      </header>

      <main>
        {eyebrow !== undefined ? <p className="label-caps mb-3">{eyebrow}</p> : null}

        <h1 className="font-display text-[34px] leading-[1.15] tracking-tight text-balance">
          {title}
        </h1>

        {lede !== undefined ? (
          <div className="mt-3 text-[15px] leading-relaxed text-ink-soft text-pretty">{lede}</div>
        ) : null}

        <div className="mt-9">{children}</div>
      </main>
    </div>
  );
}
