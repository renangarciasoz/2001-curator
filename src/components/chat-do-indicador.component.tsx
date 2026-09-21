'use client';

import { useRef, useState } from 'react';

import { lerEventosSse } from '@/lib/eventos-sse.util';

import { PainelDeCorrecao } from './painel-de-correcao.component';

import type { FalaDoTranscript } from '@/lib/transcript.type';

/** Espelha `EventoDoIndicador` do orquestrador, do lado do navegador. */
type EventoDoIndicador =
  | { tipo: 'texto'; delta: string }
  | { tipo: 'ferramenta'; nome: string; estado: 'inicio' | 'fim'; erro?: boolean }
  | { tipo: 'recusa'; categoria: string | null }
  | { tipo: 'fim'; textoCompleto: string }
  | { tipo: 'erro'; codigo: string; mensagem: string };

const ROTULO_DA_FERRAMENTA: Readonly<Record<string, string>> = {
  buscar_filmes: 'procurando no acervo',
  detalhes_do_filme: 'lendo a ficha',
  buscar_conexoes: 'consultando as pontes das curadoras',
  registrar_feedback: 'registrando a avaliação',
};

export function ChatDoIndicador({
  sessaoId,
  curadora,
  transcriptInicial,
}: {
  sessaoId: string;
  curadora: string;
  transcriptInicial: readonly FalaDoTranscript[];
}) {
  const [falas, setFalas] = useState<readonly FalaDoTranscript[]>(transcriptInicial);
  const [rascunho, setRascunho] = useState('');
  const [emAndamento, setEmAndamento] = useState(false);
  const [ferramenta, setFerramenta] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avaliando, setAvaliando] = useState(false);

  const parcial = useRef('');

  async function enviar(mensagem: string): Promise<void> {
    setErro(null);
    setEmAndamento(true);
    setAvaliando(false);
    parcial.current = '';

    setFalas((anteriores) => [
      ...anteriores,
      { autor: 'CURADORA', texto: mensagem },
      { autor: 'INDICADOR', texto: '' },
    ]);

    try {
      const resposta = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessaoId, mensagem }),
      });

      if (!resposta.ok || resposta.body === null) {
        setErro('O Indicador não respondeu. Tente de novo.');
        return;
      }

      for await (const evento of lerEventosSse<EventoDoIndicador>(resposta.body)) {
        aplicar(evento);
      }
    } catch {
      setErro('A conexão caiu no meio da conversa. O que já foi dito está salvo.');
    } finally {
      setEmAndamento(false);
      setFerramenta(null);
    }
  }

  function aplicar(evento: EventoDoIndicador): void {
    switch (evento.tipo) {
      case 'texto':
        parcial.current += evento.delta;
        substituirUltimaFala(parcial.current);
        break;

      case 'ferramenta':
        setFerramenta(
          evento.estado === 'inicio' ? (ROTULO_DA_FERRAMENTA[evento.nome] ?? evento.nome) : null,
        );
        break;

      case 'recusa':
        setErro('O Indicador não pôde responder a este pedido.');
        break;

      case 'fim':
        substituirUltimaFala(evento.textoCompleto);
        break;

      case 'erro':
        setErro(evento.mensagem);
        break;

      default: {
        const _exaustivo: never = evento;
        throw new Error(`evento não tratado: ${JSON.stringify(_exaustivo)}`);
      }
    }
  }

  function substituirUltimaFala(texto: string): void {
    setFalas((anteriores) => {
      const copia = [...anteriores];
      const ultima = copia.length - 1;

      if (copia[ultima]?.autor === 'INDICADOR') {
        copia[ultima] = { autor: 'INDICADOR', texto };
      }

      return copia;
    });
  }

  const ultimoPedido = [...falas].reverse().find((fala) => fala.autor === 'CURADORA')?.texto ?? '';
  const ultimaRecomendacao =
    [...falas].reverse().find((fala) => fala.autor === 'INDICADOR')?.texto ?? '';

  return (
    <>
      <div className="transcript">
        {falas.map((fala, posicao) => (
          <div
            // O transcript só cresce no fim; a posição é estável por construção.
            key={`${String(posicao)}-${fala.autor}`}
            className={`fala ${fala.autor === 'CURADORA' ? 'fala-curadora' : 'fala-indicador'}`}
          >
            <span className="quem">
              {fala.autor === 'CURADORA' ? 'Você' : 'O Indicador'}
            </span>
            {fala.texto}
          </div>
        ))}
      </div>

      {ferramenta !== null ? <p className="ferramenta">O Indicador está {ferramenta}…</p> : null}

      {erro !== null ? (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      ) : null}

      <form
        className="painel"
        onSubmit={(evento) => {
          evento.preventDefault();

          const mensagem = rascunho.trim();

          if (mensagem.length === 0 || emAndamento) {
            return;
          }

          setRascunho('');
          void enviar(mensagem);
        }}
      >
        <label htmlFor="mensagem">Sua mensagem</label>
        <textarea
          id="mensagem"
          value={rascunho}
          disabled={emAndamento}
          placeholder="Traga um pedido real, ou teste uma persona de espectador."
          onChange={(evento) => {
            setRascunho(evento.target.value);
          }}
        />

        <div className="acoes">
          <button type="submit" disabled={emAndamento || rascunho.trim().length === 0}>
            {emAndamento ? 'O Indicador está pensando…' : 'Enviar'}
          </button>

          <button
            type="button"
            disabled={emAndamento || ultimaRecomendacao.length === 0}
            onClick={() => {
              setAvaliando((aberto) => !aberto);
            }}
          >
            {avaliando ? 'Fechar avaliação' : 'Avaliar esta recomendação'}
          </button>
        </div>
      </form>

      {avaliando ? (
        <PainelDeCorrecao
          sessaoId={sessaoId}
          curadora={curadora}
          pedidoInicial={ultimoPedido}
          recomendacaoInicial={ultimaRecomendacao}
          onRegistrado={() => {
            setAvaliando(false);
          }}
        />
      ) : null}
    </>
  );
}
