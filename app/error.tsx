'use client';

import { useEffect } from 'react';

/**
 * Root error boundary.
 *
 * The exception message is deliberately not shown: it can carry infrastructure
 * detail. The browser console records it for whoever is debugging; the real log
 * stays on the server.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main>
      <h1>Algo deu errado</h1>
      <p className="muted">
        O Indicador não conseguiu montar esta página. Nada do que você escreveu foi perdido.
      </p>
      <div className="actions">
        <button
          type="button"
          onClick={() => {
            reset();
          }}
        >
          Tentar de novo
        </button>
      </div>
    </main>
  );
}
