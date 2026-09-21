import { Instrument_Serif, Inter, Source_Serif_4 } from 'next/font/google';

import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/** The wordmark and page titles: one weight, high contrast, magazine masthead. */
const displaySerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
});

/** Everything the curators actually read. Variable weight, built for screens. */
const proseSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  display: 'swap',
});

/** Labels, metadata and controls — never body copy. */
const labelSans = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Indicador 2001',
  description: 'Ferramenta interna de curadoria da 2001 Vídeo.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${displaySerif.variable} ${proseSerif.variable} ${labelSans.variable}`}
    >
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
