import { IBM_Plex_Mono, Inter, Jost } from 'next/font/google';

import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * Display: a Futura revival. The film's title cards and poster are Futura, and
 * the store took its name from the film.
 */
const displayGeometric = Jost({
  subsets: ['latin'],
  variable: '--font-jost',
  display: 'swap',
});

/** Body and controls. A geometric face at reading size for hours is punishing. */
const uiSans = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

/** The instrument voice: labels, metadata, identifiers. Never prose. */
const instrumentMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
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
      className={`${displayGeometric.variable} ${uiSans.variable} ${instrumentMono.variable}`}
    >
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
