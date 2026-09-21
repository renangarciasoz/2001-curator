'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Opens a chat session, optionally tied to a viewer persona.
 *
 * The persona is what gives memory between visits: once linked, the Indicador
 * starts receiving what is already known about that person — and, more
 * importantly, what is not yet known and must be asked before recommending.
 */
export function OpenSession() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  async function open(): Promise<void> {
    setError(null);
    setOpening(true);

    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(userId.trim().length > 0 ? { userId: userId.trim() } : {}),
      });

      if (!response.ok) {
        setError('Não foi possível abrir a sessão.');
        return;
      }

      const body: unknown = await response.json();
      const sessionId: unknown =
        typeof body === 'object' && body !== null ? Reflect.get(body, 'sessionId') : null;

      if (typeof sessionId !== 'string') {
        setError('Resposta inesperada ao abrir a sessão.');
        return;
      }

      router.push(`/chat/${sessionId}`);
    } finally {
      setOpening(false);
    }
  }

  return (
    <form
      className="border-t border-seam-lit pt-6"
      onSubmit={(event) => {
        event.preventDefault();
        void open();
      }}
    >
      <label htmlFor="userId" className="label-caps mb-2 block">
        Persona do espectador — opcional
      </label>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="userId"
          type="text"
          value={userId}
          placeholder="cliente-premium-ana"
          className="field font-mono text-[14px] sm:flex-1"
          onChange={(event) => {
            setUserId(event.target.value);
          }}
        />
        <button type="submit" disabled={opening} className="btn btn-primary justify-center">
          {opening ? 'Abrindo…' : 'Nova conversa'}
        </button>
      </div>

      <p className="mt-3 text-[14px] leading-relaxed text-signal-dim">
        Use o mesmo identificador para continuar a história de um espectador entre sessões. Em
        branco, é uma conversa avulsa.
      </p>

      {error !== null ? (
        <p className="note note-alert mt-4" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
