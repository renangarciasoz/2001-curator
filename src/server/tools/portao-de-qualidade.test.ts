import { describe, expect, it } from 'vitest';

import { FeedbackAmbiguoError } from '@/lib/app-error.util';

import { aplicarPortaoDeQualidade } from './portao-de-qualidade.util';

import type { AvaliacaoDeCuradora } from './portao-de-qualidade.util';

const PORQUE_BOM =
  'Ela pediu conforto e a indicação exigia disposição para ser desestabilizada.';
const OUTRO_PORQUE_BOM =
  'O filme é certo, mas cedo demais no repertório dela — precisa de uma ponte antes.';

function avaliacao(
  curador: 'SONIA' | 'MIRELLA',
  extra: Partial<AvaliacaoDeCuradora> = {},
): AvaliacaoDeCuradora {
  return { curador, houveCorrecao: false, ...extra };
}

describe('portão de qualidade', () => {
  describe('uma curadora só', () => {
    it('absorve com confiança normal quando não houve correção', () => {
      const decisao = aplicarPortaoDeQualidade([avaliacao('SONIA')]);

      expect(decisao).toMatchObject({
        avaliadoPor: 'SONIA',
        consenso: 'SO_UMA_AVALIOU',
        qualidade: 'ABSORVE',
        confianca: 'NORMAL',
        correcao: null,
        notaDaDivergencia: null,
      });
    });

    it('absorve a correção junto com o porquê', () => {
      const decisao = aplicarPortaoDeQualidade([
        avaliacao('MIRELLA', {
          houveCorrecao: true,
          correcao: 'Central do Brasil',
          porque: PORQUE_BOM,
        }),
      ]);

      expect(decisao).toMatchObject({
        avaliadoPor: 'MIRELLA',
        qualidade: 'ABSORVE',
        correcao: 'Central do Brasil',
        porqueDaCorrecao: PORQUE_BOM,
      });
    });
  });

  describe('o porquê é obrigatório', () => {
    it('recusa correção sem porquê', () => {
      expect(() =>
        aplicarPortaoDeQualidade([
          avaliacao('SONIA', { houveCorrecao: true, correcao: 'Rashomon' }),
        ]),
      ).toThrow(FeedbackAmbiguoError);
    });

    it('recusa correção sem dizer qual é a correção', () => {
      expect(() =>
        aplicarPortaoDeQualidade([
          avaliacao('SONIA', { houveCorrecao: true, porque: PORQUE_BOM }),
        ]),
      ).toThrow(FeedbackAmbiguoError);
    });

    it('recusa porquê de reflexo', () => {
      expect(() =>
        aplicarPortaoDeQualidade([
          avaliacao('SONIA', {
            houveCorrecao: true,
            correcao: 'Rashomon',
            porque: 'não gostei',
          }),
        ]),
      ).toThrow(FeedbackAmbiguoError);
    });

    it('devolve uma pergunta para a curadora, não só um erro', () => {
      try {
        aplicarPortaoDeQualidade([
          avaliacao('SONIA', { houveCorrecao: true, correcao: 'Rashomon' }),
        ]);
        expect.unreachable('o portão deveria ter recusado');
      } catch (e) {
        expect(e).toBeInstanceOf(FeedbackAmbiguoError);

        if (e instanceof FeedbackAmbiguoError) {
          expect(e.pedidoDeEsclarecimento).toContain('porquê');
        }
      }
    });
  });

  describe('as duas curadoras', () => {
    it('absorve com confiança alta quando nenhuma corrigiu', () => {
      const decisao = aplicarPortaoDeQualidade([avaliacao('SONIA'), avaliacao('MIRELLA')]);

      expect(decisao).toMatchObject({
        avaliadoPor: 'AMBAS',
        consenso: 'ACORDO',
        qualidade: 'ABSORVE',
        confianca: 'ALTA',
      });
    });

    it('trata "uma corrigiu, a outra não" como divergência', () => {
      const decisao = aplicarPortaoDeQualidade([
        avaliacao('SONIA'),
        avaliacao('MIRELLA', {
          houveCorrecao: true,
          correcao: 'Central do Brasil',
          porque: PORQUE_BOM,
        }),
      ]);

      expect(decisao).toMatchObject({
        consenso: 'DIVERGENCIA',
        qualidade: 'REVISAR',
        confianca: null,
        correcao: null,
      });
      expect(decisao.notaDaDivergencia).toContain('SONIA');
      expect(decisao.notaDaDivergencia).toContain('MIRELLA');
    });

    it('pergunta em vez de adivinhar quando as duas corrigiram', () => {
      expect(() =>
        aplicarPortaoDeQualidade([
          avaliacao('SONIA', { houveCorrecao: true, correcao: 'A', porque: PORQUE_BOM }),
          avaliacao('MIRELLA', { houveCorrecao: true, correcao: 'B', porque: OUTRO_PORQUE_BOM }),
        ]),
      ).toThrow(FeedbackAmbiguoError);
    });

    it('registra as duas leituras quando declaram que discordam', () => {
      const decisao = aplicarPortaoDeQualidade(
        [
          avaliacao('SONIA', { houveCorrecao: true, correcao: 'A', porque: PORQUE_BOM }),
          avaliacao('MIRELLA', { houveCorrecao: true, correcao: 'B', porque: OUTRO_PORQUE_BOM }),
        ],
        false,
      );

      expect(decisao).toMatchObject({
        consenso: 'DIVERGENCIA',
        qualidade: 'REVISAR',
        correcao: null,
        porqueDaCorrecao: null,
      });
      expect(decisao.notaDaDivergencia).toContain(PORQUE_BOM);
      expect(decisao.notaDaDivergencia).toContain(OUTRO_PORQUE_BOM);
    });

    it('absorve com confiança alta quando declaram a mesma leitura', () => {
      const decisao = aplicarPortaoDeQualidade(
        [
          avaliacao('SONIA', { houveCorrecao: true, correcao: 'A', porque: PORQUE_BOM }),
          avaliacao('MIRELLA', { houveCorrecao: true, correcao: 'A', porque: OUTRO_PORQUE_BOM }),
        ],
        true,
      );

      expect(decisao).toMatchObject({
        consenso: 'ACORDO',
        qualidade: 'ABSORVE',
        confianca: 'ALTA',
        correcao: 'A',
      });
      expect(decisao.porqueDaCorrecao).toContain(PORQUE_BOM);
      expect(decisao.porqueDaCorrecao).toContain(OUTRO_PORQUE_BOM);
    });
  });

  describe('entradas inválidas', () => {
    it('recusa avaliação nenhuma', () => {
      expect(() => aplicarPortaoDeQualidade([])).toThrow(FeedbackAmbiguoError);
    });

    it('recusa duas avaliações da mesma curadora', () => {
      expect(() =>
        aplicarPortaoDeQualidade([avaliacao('SONIA'), avaliacao('SONIA')]),
      ).toThrow(FeedbackAmbiguoError);
    });
  });
});
