import 'server-only';

/**
 * The Indicador's four tools, in the order it usually needs them.
 *
 * The order is fixed on purpose: the tool list sits in the prompt-cache prefix,
 * and reordering it on each request would invalidate the whole cache.
 *
 * Names and parameters are English because they are the API contract. The
 * descriptions are Portuguese because they are prompt content, read by the same
 * model in the same context as the Method — see `src/method/system-prompt.constant.ts`.
 *
 * `strict` is not used: arguments are validated with Zod in the dispatcher,
 * which is the same guarantee with error messages the model can act on.
 */
export const INDICADOR_TOOLS = [
  {
    name: 'search_films',
    description: [
      'Busca no acervo da 2001 por proximidade de significado — tom, tema, o que a obra',
      'faz com o espectador — e não por palavra-chave exata.',
      '',
      'Use quando precisar de candidatos para uma indicação. Descreva o critério como',
      'você descreveria a uma colega de balcão: "alguém que acabou de perder o pai e',
      'quer chorar sem se destruir", não "drama família luto".',
      '',
      'Devolve até 20 candidatos com a ficha factual e a camada curatorial de cada um.',
      'Candidatos com has_2001_curation = false ainda não receberam o estudo das',
      'curadoras: use com cautela e diga isso à curadora.',
    ].join('\n'),
    input_schema: {
      type: 'object' as const,
      properties: {
        criteria: {
          type: 'string',
          description:
            'O que se procura, em linguagem natural: o tom, o tema, o que a pessoa precisa sentir.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Quantos candidatos trazer. Padrão 12.',
        },
        commercial_register: {
          type: 'string',
          enum: ['COMMERCIAL', 'ARTHOUSE', 'BOTH'],
          description: 'Restringe o registro. Use com parcimônia: todo filme é filme.',
        },
        archive_category: {
          type: 'string',
          description: 'Restringe a uma categoria da taxonomia do acervo.',
        },
        min_year: { type: 'integer', description: 'Ano de lançamento mínimo.' },
        max_year: { type: 'integer', description: 'Ano de lançamento máximo.' },
      },
      required: ['criteria'],
      additionalProperties: false,
    },
  },
  {
    name: 'film_details',
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
        film_id: {
          type: 'string',
          description: 'O film_id devolvido por search_films ou search_connections.',
        },
      },
      required: ['film_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_connections',
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
        film_id: { type: 'string', description: 'Filme de origem da ponte.' },
        type: {
          type: 'string',
          enum: [
            'ENTRY_POINT',
            'IF_YOU_LIKED',
            'BEFORE_WATCHING',
            'RELEASE_TO_ARCHIVE',
            'ARCHIVE_TO_RELEASE',
            'OTHER',
          ],
          description: 'Restringe a um tipo de ponte.',
        },
      },
      required: ['film_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'record_feedback',
    description: [
      'Grava a avaliação de uma recomendação pelas curadoras. Este é o dado mais',
      'valioso do projeto — o que treina o modelo próprio na Fase 2.',
      '',
      'Chame SÓ quando a curadora tiver avaliado de verdade. Regras do portão:',
      '  • correção sem porquê não é gravada — pergunte o porquê antes;',
      '  • se as duas corrigiram, pergunte se é a mesma leitura e mande both_agree;',
      '  • divergência não é problema: as duas leituras ficam registradas, sem vencedora.',
      '',
      'Se a tool devolver um pedido de esclarecimento, faça a pergunta à curadora e',
      'chame de novo com a resposta. Nunca invente o porquê no lugar dela.',
    ].join('\n'),
    input_schema: {
      type: 'object' as const,
      properties: {
        conversation_id: {
          type: 'string',
          description: 'Conversa já aberta nesta sessão. Omita para abrir uma nova.',
        },
        user_request: {
          type: 'string',
          description: 'O que a pessoa queria, o mais próximo possível das palavras dela.',
        },
        ai_questions: {
          type: 'array',
          items: { type: 'string' },
          description: 'As perguntas que você fez antes de indicar.',
        },
        ai_recommendation: {
          type: 'string',
          description: 'O que você sugeriu, com a justificativa de cada opção.',
        },
        reviews: {
          type: 'array',
          minItems: 1,
          maxItems: 2,
          description: 'Uma entrada por curadora que avaliou.',
          items: {
            type: 'object',
            properties: {
              curator: { type: 'string', enum: ['SONIA', 'MIRELLA'] },
              has_correction: { type: 'boolean' },
              correction: { type: 'string', description: 'A indicação que entra no lugar.' },
              reason: {
                type: 'string',
                description:
                  'Obrigatório quando has_correction é true. Nas palavras da curadora.',
              },
            },
            required: ['curator', 'has_correction'],
            additionalProperties: false,
          },
        },
        both_agree: {
          type: 'boolean',
          description: 'Só quando as duas corrigiram: as leituras delas são a mesma?',
        },
        recommended_films: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 3,
          description: 'film_id das opções que você indicou (no máximo 3).',
        },
        corrected_films: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 3,
          description: 'film_id das opções que a curadora colocou no lugar.',
        },
      },
      required: ['user_request', 'ai_recommendation', 'reviews'],
      additionalProperties: false,
    },
  },
];
