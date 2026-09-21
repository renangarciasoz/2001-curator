'use client';

import { useEffect } from 'react';

/**
 * Fronteira de erro da raiz.
 *
 * A mensagem da exceção não é mostrada de propósito: ela pode carregar detalhe
 * de infraestrutura. O console do navegador registra para quem está depurando;
 * o log real fica no servidor.
 */
export default function Erro({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main>
      <h1>Algo deu errado</h1>
      <p className="sutil">
        O Indicador não conseguiu montar esta página. Nada do que você escreveu foi perdido.
      </p>
      <div className="acoes">
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
