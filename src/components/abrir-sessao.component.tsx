'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Abre uma sessão de chat, opcionalmente ligada a uma persona de espectador.
 *
 * A persona é o que dá memória entre visitas: ligada uma vez, o Indicador passa
 * a receber o que já se sabe daquela pessoa — e, mais importante, o que ainda
 * não se sabe e precisa ser perguntado antes de indicar.
 */
export function AbrirSessao() {
  const router = useRouter();
  const [usuarioId, setUsuarioId] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  async function abrir(): Promise<void> {
    setErro(null);
    setAbrindo(true);

    try {
      const resposta = await fetch('/api/sessao', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          usuarioId.trim().length > 0 ? { usuarioId: usuarioId.trim() } : {},
        ),
      });

      if (!resposta.ok) {
        setErro('Não foi possível abrir a sessão.');
        return;
      }

      const corpo: unknown = await resposta.json();
      const sessaoId: unknown =
        typeof corpo === 'object' && corpo !== null ? Reflect.get(corpo, 'sessaoId') : null;

      if (typeof sessaoId !== 'string') {
        setErro('Resposta inesperada ao abrir a sessão.');
        return;
      }

      router.push(`/chat/${sessaoId}`);
    } finally {
      setAbrindo(false);
    }
  }

  return (
    <form
      className="painel"
      onSubmit={(evento) => {
        evento.preventDefault();
        void abrir();
      }}
    >
      <label htmlFor="usuarioId">Persona do espectador (opcional)</label>
      <input
        id="usuarioId"
        type="text"
        value={usuarioId}
        placeholder="ex.: cliente-premium-ana"
        onChange={(evento) => {
          setUsuarioId(evento.target.value);
        }}
      />
      <p className="sutil">
        Use o mesmo identificador para continuar a história de um espectador entre sessões. Deixe
        em branco para uma conversa avulsa.
      </p>

      {erro !== null ? (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      ) : null}

      <div className="acoes">
        <button type="submit" disabled={abrindo}>
          {abrindo ? 'Abrindo…' : 'Começar uma conversa'}
        </button>
      </div>
    </form>
  );
}
