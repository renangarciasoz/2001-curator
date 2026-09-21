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
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        void open();
      }}
    >
      <label htmlFor="userId">Persona do espectador (opcional)</label>
      <input
        id="userId"
        type="text"
        value={userId}
        placeholder="ex.: cliente-premium-ana"
        onChange={(event) => {
          setUserId(event.target.value);
        }}
      />
      <p className="muted">
        Use o mesmo identificador para continuar a história de um espectador entre sessões. Deixe
        em branco para uma conversa avulsa.
      </p>

      {error !== null ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="actions">
        <button type="submit" disabled={opening}>
          {opening ? 'Abrindo…' : 'Começar uma conversa'}
        </button>
      </div>
    </form>
  );
}
