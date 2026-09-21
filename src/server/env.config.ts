import 'server-only';

import { z } from 'zod';

import { ConfiguracaoInvalidaError } from '@/lib/app-error.util';

/**
 * Contrato de configuração. Nenhum segredo tem valor padrão embutido: chaves
 * ausentes viram string vazia e cada serviço decide se pode operar sem ela
 * (embeddings caem no fallback local; o chat, não).
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),

  QDRANT_URL: z.url(),
  QDRANT_API_KEY: z.string().default(''),
  QDRANT_COLLECTION: z.string().min(1).default('filmes'),

  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-opus-5'),

  EMBEDDINGS_PROVIDER: z.enum(['voyage', 'openai', 'local']).default('voyage'),
  VOYAGE_API_KEY: z.string().default(''),
  VOYAGE_MODEL: z.string().min(1).default('voyage-3'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_EMBEDDINGS_MODEL: z.string().min(1).default('text-embedding-3-small'),

  TMDB_ACCESS_TOKEN: z.string().default(''),
  TMDB_LANGUAGE: z.string().min(1).default('pt-BR'),

  APP_SENHA_CURADORIA: z.string().default(''),
  APP_SESSION_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Lê e valida o ambiente. Falha no arranque — nunca cai num valor de
 * desenvolvimento embutido.
 *
 * @throws {ConfiguracaoInvalidaError} quando uma variável obrigatória falta.
 */
function carregarEnv(): Env {
  const resultado = EnvSchema.safeParse(process.env);

  if (!resultado.success) {
    const detalhe = resultado.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    throw new ConfiguracaoInvalidaError(`${detalhe}. Confira o .env.example.`);
  }

  return resultado.data;
}

export const env: Env = carregarEnv();
