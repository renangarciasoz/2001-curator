'use client';

import { useState } from 'react';

import { CURADORAS, nomeDaCuradora } from '@/lib/curadora.constant';

import type { Curadora } from '@/lib/curadora.constant';

/** Espelha o mínimo exigido pelo portão de qualidade no servidor. */
const TAMANHO_MINIMO_DO_PORQUE = 15;

type EstadoDaAvaliacao = {
  participa: boolean;
  houveCorrecao: boolean;
  correcao: string;
  porque: string;
};

const AVALIACAO_VAZIA: EstadoDaAvaliacao = {
  participa: false,
  houveCorrecao: false,
  correcao: '',
  porque: '',
};

/**
 * A interface de correção.
 *
 * Ela existe para uma coisa só: garantir que nenhuma correção seja gravada sem
 * o porquê. A validação aqui é conveniência — quem manda é o portão de
 * qualidade no servidor, e o banco tem CHECK constraint para o caso de alguém
 * chamar a API direto.
 */
export function PainelDeCorrecao({
  sessaoId,
  curadora,
  pedidoInicial,
  recomendacaoInicial,
  onRegistrado,
}: {
  sessaoId: string;
  curadora: string;
  pedidoInicial: string;
  recomendacaoInicial: string;
  onRegistrado: () => void;
}) {
  const [pedido, setPedido] = useState(pedidoInicial);
  const [recomendacao, setRecomendacao] = useState(recomendacaoInicial);
  const [perguntas, setPerguntas] = useState('');

  const [avaliacoes, setAvaliacoes] = useState<Record<Curadora, EstadoDaAvaliacao>>({
    SONIA: { ...AVALIACAO_VAZIA, participa: curadora === 'SONIA' },
    MIRELLA: { ...AVALIACAO_VAZIA, participa: curadora === 'MIRELLA' },
  });

  const [asDuasConcordam, setAsDuasConcordam] = useState<boolean | null>(null);
  const [esclarecimento, setEsclarecimento] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const participantes = CURADORAS.filter((nome) => avaliacoes[nome].participa);
  const asDuasCorrigiram =
    participantes.length === 2 && participantes.every((nome) => avaliacoes[nome].houveCorrecao);

  function atualizar(nome: Curadora, mudanca: Partial<EstadoDaAvaliacao>): void {
    setAvaliacoes((anterior) => ({ ...anterior, [nome]: { ...anterior[nome], ...mudanca } }));
  }

  async function registrar(): Promise<void> {
    setErro(null);
    setEsclarecimento(null);
    setEnviando(true);

    try {
      const resposta = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessao_id: sessaoId,
          pedido_do_usuario: pedido,
          perguntas_da_ia: perguntas
            .split('\n')
            .map((linha) => linha.trim())
            .filter((linha) => linha.length > 0),
          recomendacao_da_ia: recomendacao,
          avaliacoes: participantes.map((nome) => ({
            curador: nome,
            houve_correcao: avaliacoes[nome].houveCorrecao,
            correcao: avaliacoes[nome].correcao,
            porque: avaliacoes[nome].porque,
          })),
          ...(asDuasCorrigiram && asDuasConcordam !== null
            ? { as_duas_concordam: asDuasConcordam }
            : {}),
        }),
      });

      const corpo: unknown = await resposta.json();

      if (resposta.status === 422) {
        setEsclarecimento(lerCampo(corpo, 'pedidoDeEsclarecimento') ?? 'Falta o porquê.');
        return;
      }

      if (!resposta.ok) {
        setErro(lerCampo(corpo, 'mensagem') ?? 'Não foi possível registrar.');
        return;
      }

      setResumo(lerCampo(corpo, 'resumo') ?? 'Avaliação registrada.');
    } catch {
      setErro('A rede falhou. Nada foi gravado — tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  async function descartar(): Promise<void> {
    setEnviando(true);

    try {
      const resposta = await fetch('/api/feedback', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessao_id: sessaoId,
          pedido_do_usuario: pedido,
          perguntas_da_ia: [],
          recomendacao_da_ia: recomendacao,
          avaliado_por: curadora,
          motivo: esclarecimento ?? 'porquê não detalhado',
        }),
      });

      if (!resposta.ok) {
        setErro('Não foi possível registrar o descarte.');
        return;
      }

      setEsclarecimento(null);
      setResumo(
        'Registrado como descartado. A recomendação fica marcada como avaliada e não aproveitada.',
      );
    } finally {
      setEnviando(false);
    }
  }

  if (resumo !== null) {
    return (
      <div className="painel">
        <p className="aviso aviso-ok">{resumo}</p>
        <div className="acoes">
          <button type="button" onClick={onRegistrado}>
            Voltar à conversa
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="painel"
      onSubmit={(evento) => {
        evento.preventDefault();
        void registrar();
      }}
    >
      <h2>Avaliar a recomendação</h2>
      <p className="sutil">
        O que vale aqui é o porquê. Uma correção sem justificativa não é gravada — é ela que
        ensina o modelo na Fase 2.
      </p>

      <label htmlFor="pedido">O que a pessoa queria</label>
      <textarea
        id="pedido"
        value={pedido}
        onChange={(evento) => {
          setPedido(evento.target.value);
        }}
      />

      <label htmlFor="perguntas">
        O que o Indicador perguntou antes de indicar (uma por linha, opcional)
      </label>
      <textarea
        id="perguntas"
        value={perguntas}
        onChange={(evento) => {
          setPerguntas(evento.target.value);
        }}
      />

      <label htmlFor="recomendacao">O que ele indicou</label>
      <textarea
        id="recomendacao"
        value={recomendacao}
        onChange={(evento) => {
          setRecomendacao(evento.target.value);
        }}
      />

      {CURADORAS.map((nome) => (
        <fieldset key={nome} style={{ border: 0, padding: 0, margin: '20px 0 0' }}>
          <label className="escolha">
            <input
              type="checkbox"
              checked={avaliacoes[nome].participa}
              disabled={nome === curadora}
              onChange={(evento) => {
                atualizar(nome, { participa: evento.target.checked });
              }}
            />
            {nomeDaCuradora(nome)} avaliou
            {nome === curadora ? ' (você)' : ''}
          </label>

          {avaliacoes[nome].participa ? (
            <>
              <label className="escolha">
                <input
                  type="checkbox"
                  checked={avaliacoes[nome].houveCorrecao}
                  onChange={(evento) => {
                    atualizar(nome, { houveCorrecao: evento.target.checked });
                  }}
                />
                A indicação precisa de correção
              </label>

              {avaliacoes[nome].houveCorrecao ? (
                <>
                  <label htmlFor={`correcao-${nome}`}>
                    O que {nomeDaCuradora(nome)} indicaria no lugar
                  </label>
                  <textarea
                    id={`correcao-${nome}`}
                    required
                    value={avaliacoes[nome].correcao}
                    onChange={(evento) => {
                      atualizar(nome, { correcao: evento.target.value });
                    }}
                  />

                  <label htmlFor={`porque-${nome}`}>
                    Por quê — o que a pessoa precisava e esta indicação não dava
                  </label>
                  <textarea
                    id={`porque-${nome}`}
                    required
                    minLength={TAMANHO_MINIMO_DO_PORQUE}
                    value={avaliacoes[nome].porque}
                    onChange={(evento) => {
                      atualizar(nome, { porque: evento.target.value });
                    }}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </fieldset>
      ))}

      {asDuasCorrigiram ? (
        <fieldset style={{ border: 0, padding: 0, margin: '20px 0 0' }}>
          <legend style={{ fontSize: 13, fontWeight: 600, padding: 0 }}>
            As duas corrigiram. É a mesma leitura?
          </legend>
          <p className="sutil">
            Divergência não é problema: as duas leituras ficam registradas lado a lado, sem
            vencedora, e a conversa vai para revisão.
          </p>

          <label className="escolha">
            <input
              type="radio"
              name="concordancia"
              checked={asDuasConcordam === true}
              onChange={() => {
                setAsDuasConcordam(true);
              }}
            />
            Mesma leitura
          </label>

          <label className="escolha">
            <input
              type="radio"
              name="concordancia"
              checked={asDuasConcordam === false}
              onChange={() => {
                setAsDuasConcordam(false);
              }}
            />
            Leituras diferentes
          </label>
        </fieldset>
      ) : null}

      {esclarecimento !== null ? (
        <div className="aviso" role="alert">
          <p>
            <strong>Nada foi gravado.</strong> {esclarecimento}
          </p>
          <div className="acoes">
            <button type="button" disabled={enviando} onClick={() => void descartar()}>
              Não quero detalhar — registrar como descartado
            </button>
          </div>
        </div>
      ) : null}

      {erro !== null ? (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      ) : null}

      <div className="acoes">
        <button type="submit" disabled={enviando || participantes.length === 0}>
          {enviando ? 'Registrando…' : 'Registrar avaliação'}
        </button>
        <button type="button" disabled={enviando} onClick={onRegistrado}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Lê um campo de texto de uma resposta JSON sem confiar no formato dela. */
function lerCampo(corpo: unknown, campo: string): string | null {
  if (typeof corpo !== 'object' || corpo === null) {
    return null;
  }

  const valor: unknown = Reflect.get(corpo, campo);

  return typeof valor === 'string' ? valor : null;
}
