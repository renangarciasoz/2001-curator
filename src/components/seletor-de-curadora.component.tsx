'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CURADORAS, ehCuradora, nomeDaCuradora } from '@/lib/curadora.constant';

import type { Curadora } from '@/lib/curadora.constant';

/**
 * Login que só precisa fazer uma coisa: dizer se é Sonia ou Mirella.
 *
 * Essa distinção não é conforto de interface — é o que dá rastreabilidade a
 * cada avaliação no dataset. Sem ela o portão de qualidade não sabe se houve
 * acordo, divergência ou uma leitura só.
 */
export function SeletorDeCuradora({ exigeSenha }: { exigeSenha: boolean }) {
  const router = useRouter();
  const [curadora, setCuradora] = useState<Curadora>('SONIA');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: React.FormEvent): Promise<void> {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      const resposta = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ curadora, senha }),
      });

      if (!resposta.ok) {
        setErro('Não foi possível entrar. Confira a senha de curadoria.');
        return;
      }

      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      className="painel"
      onSubmit={(evento) => {
        void entrar(evento);
      }}
    >
      <label htmlFor="curadora">Quem está entrando</label>
      <select
        id="curadora"
        value={curadora}
        onChange={(evento) => {
          if (ehCuradora(evento.target.value)) {
            setCuradora(evento.target.value);
          }
        }}
      >
        {CURADORAS.map((nome) => (
          <option key={nome} value={nome}>
            {nomeDaCuradora(nome)}
          </option>
        ))}
      </select>

      {exigeSenha ? (
        <>
          <label htmlFor="senha">Senha de curadoria</label>
          <input
            id="senha"
            type="password"
            value={senha}
            autoComplete="current-password"
            onChange={(evento) => {
              setSenha(evento.target.value);
            }}
          />
        </>
      ) : null}

      {erro !== null ? (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      ) : null}

      <div className="acoes">
        <button type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </form>
  );
}
