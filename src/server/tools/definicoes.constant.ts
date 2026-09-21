import 'server-only';

/**
 * As quatro tools do Indicador, na ordem em que ele costuma precisar delas.
 *
 * A ordem é fixa de propósito: a lista de tools entra no prefixo do cache de
 * prompt, e reordená-la a cada request invalidaria o cache inteiro.
 *
 * `strict` não é usado: os argumentos são validados com Zod no dispatcher, que
 * é a mesma garantia com mensagens de erro que o modelo consegue corrigir.
 */
export const TOOLS_DO_INDICADOR = [
  {
    name: 'buscar_filmes',
    description: [
      'Busca no acervo da 2001 por proximidade de significado — tom, tema, o que a obra',
      'faz com o espectador — e não por palavra-chave exata.',
      '',
      'Use quando precisar de candidatos para uma indicação. Descreva o critério como',
      'você descreveria a uma colega de balcão: "alguém que acabou de perder o pai e',
      'quer chorar sem se destruir", não "drama família luto".',
      '',
      'Devolve até 20 candidatos com a ficha factual e a camada curatorial de cada um.',
      'Candidatos com tem_curadoria_2001 = false ainda não receberam o estudo das',
      'curadoras: use com cautela e diga isso à curadora.',
    ].join('\n'),
    input_schema: {
      type: 'object' as const,
      properties: {
        criterio: {
          type: 'string',
          description:
            'O que se procura, em linguagem natural: o tom, o tema, o que a pessoa precisa sentir.',
        },
        limite: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Quantos candidatos trazer. Padrão 12.',
        },
        registro_comercial: {
          type: 'string',
          enum: ['COMERCIAL', 'CABECA', 'AMBOS'],
          description: 'Restringe o registro. Use com parcimônia: todo filme é filme.',
        },
        categoria_acervo: {
          type: 'string',
          description: 'Restringe a uma categoria da taxonomia do acervo.',
        },
        ano_minimo: { type: 'integer', description: 'Ano de lançamento mínimo.' },
        ano_maximo: { type: 'integer', description: 'Ano de lançamento máximo.' },
      },
      required: ['criterio'],
      additionalProperties: false,
    },
  },
  {
    name: 'detalhes_do_filme',
    description: [
      'Ficha completa de um filme: dados factuais e o estudo das curadoras —',
      'tom emocional, o que provoca, notas de curadoria, contexto histórico.',
      '',
      'Use antes de justificar uma indicação, para falar do filme com o que a 2001',
      'sabe dele, e não com o que você lembra de fora.',
    ].join('\n'),
    input_schema: {
      type: 'object' as const,
      properties: {
        filme_id: {
          type: 'string',
          description: 'O filme_id devolvido por buscar_filmes ou buscar_conexoes.',
        },
      },
      required: ['filme_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'buscar_conexoes',
    description: [
      'As pontes que Sonia e Mirella estabeleceram a partir de um filme, cada uma',
      'com o porquê que a curadora escreveu.',
      '',
      'Esta é a tool que materializa o Método: indicar não é entregar um título, é',
      'construir uma ponte. Sempre que for conduzir alguém de um filme a outro,',
      'consulte as conexões antes de inventar a sua própria ligação — e quando usar',
      'uma, empreste o porquê da curadora em vez de improvisar um.',
    ].join('\n'),
    input_schema: {
      type: 'object' as const,
      properties: {
        filme_id: { type: 'string', description: 'Filme de origem da ponte.' },
        tipo: {
          type: 'string',
          enum: [
            'PORTA_DE_ENTRADA',
            'SE_GOSTOU_DE',
            'ANTES_DE_VER',
            'LANCAMENTO_PARA_ACERVO',
            'ACERVO_PARA_LANCAMENTO',
            'OUTRO',
          ],
          description: 'Restringe a um tipo de ponte.',
        },
      },
      required: ['filme_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'registrar_feedback',
    description: [
      'Grava a avaliação de uma recomendação pelas curadoras. Este é o dado mais',
      'valioso do projeto — o que treina o modelo próprio na Fase 2.',
      '',
      'Chame SÓ quando a curadora tiver avaliado de verdade. Regras do portão:',
      '  • correção sem porquê não é gravada — pergunte o porquê antes;',
      '  • se as duas corrigiram, pergunte se é a mesma leitura e mande as_duas_concordam;',
      '  • divergência não é problema: as duas leituras ficam registradas, sem vencedora.',
      '',
      'Se a tool devolver um pedido de esclarecimento, faça a pergunta à curadora e',
      'chame de novo com a resposta. Nunca invente o porquê no lugar dela.',
    ].join('\n'),
    input_schema: {
      type: 'object' as const,
      properties: {
        conversa_id: {
          type: 'string',
          description: 'Conversa já aberta nesta sessão. Omita para abrir uma nova.',
        },
        pedido_do_usuario: {
          type: 'string',
          description: 'O que a pessoa queria, o mais próximo possível das palavras dela.',
        },
        perguntas_da_ia: {
          type: 'array',
          items: { type: 'string' },
          description: 'As perguntas que você fez antes de indicar.',
        },
        recomendacao_da_ia: {
          type: 'string',
          description: 'O que você sugeriu, com a justificativa de cada opção.',
        },
        avaliacoes: {
          type: 'array',
          minItems: 1,
          maxItems: 2,
          description: 'Uma entrada por curadora que avaliou.',
          items: {
            type: 'object',
            properties: {
              curador: { type: 'string', enum: ['SONIA', 'MIRELLA'] },
              houve_correcao: { type: 'boolean' },
              correcao: { type: 'string', description: 'A indicação que entra no lugar.' },
              porque: {
                type: 'string',
                description: 'Obrigatório quando houve_correcao é true. Nas palavras da curadora.',
              },
            },
            required: ['curador', 'houve_correcao'],
            additionalProperties: false,
          },
        },
        as_duas_concordam: {
          type: 'boolean',
          description: 'Só quando as duas corrigiram: as leituras delas são a mesma?',
        },
        filmes_recomendados: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 3,
          description: 'filme_id das opções que você indicou (no máximo 3).',
        },
        filmes_corrigidos: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 3,
          description: 'filme_id das opções que a curadora colocou no lugar.',
        },
      },
      required: ['pedido_do_usuario', 'recomendacao_da_ia', 'avaliacoes'],
      additionalProperties: false,
    },
  },
];
