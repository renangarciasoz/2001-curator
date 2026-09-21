'use client';

import { useEffect } from 'react';

/**
 * Root error boundary.
 *
 * The exception message is deliberately not shown: it can carry infrastructure
 * detail. The browser console records it for whoever is debugging; the real log
 * stays on the server.
 */
export default function ErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 pt-8 pb-28 sm:px-8">
      <p className="label-caps mb-4 flex items-center gap-3">
        <span aria-hidden="true" className="hal-eye" />
        Falha
      </p>
      <h1 className="font-display text-[40px] leading-[1.05] font-light">Algo deu errado</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-signal-dim text-pretty">
        O Indicador não conseguiu montar esta página. Nada do que você escreveu foi perdido.
      </p>

      <div className="mt-8">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            reset();
          }}
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
