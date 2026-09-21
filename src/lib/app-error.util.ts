/**
 * Base de todos os erros de domínio do Indicador.
 *
 * O `code` é estável e serve para correlação em log e para o cliente HTTP
 * decidir o que mostrar — a `message` nunca é devolvida crua numa resposta.
 */
export class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = this.constructor.name;
  }
}

/** Uma variável de ambiente obrigatória está ausente ou malformada. */
export class ConfiguracaoInvalidaError extends AppError {
  constructor(detalhe: string, options?: ErrorOptions) {
    super('configuracao_invalida', `configuração inválida: ${detalhe}`, options);
  }
}

/** Um provider externo (TMDB, embeddings, Anthropic) não respondeu ou recusou. */
export class ProviderIndisponivelError extends AppError {
  readonly provider: string;

  constructor(provider: string, detalhe: string, options?: ErrorOptions) {
    super('provider_indisponivel', `${provider} indisponível: ${detalhe}`, options);
    this.provider = provider;
  }
}

export class FilmeNaoEncontradoError extends AppError {
  constructor(filmeId: string) {
    super('filme_nao_encontrado', `filme ${filmeId} não existe no acervo`);
  }
}

export class SessaoNaoEncontradaError extends AppError {
  constructor(sessaoId: string) {
    super('sessao_nao_encontrada', `sessão ${sessaoId} não existe`);
  }
}

export class ConversaNaoEncontradaError extends AppError {
  constructor(conversaId: string) {
    super('conversa_nao_encontrada', `conversa ${conversaId} não existe`);
  }
}

/** A curadora não está autenticada, ou a senha de curadoria não confere. */
export class CuradoraNaoAutenticadaError extends AppError {
  constructor(detalhe = 'nenhuma curadora identificada nesta sessão') {
    super('curadora_nao_autenticada', detalhe);
  }
}

/**
 * O feedback chegou pobre ou ambíguo demais para virar dado.
 *
 * Não é uma falha técnica: é o portão de qualidade pedindo esclarecimento antes
 * de gravar. Quem recebe este erro deve perguntar, não descartar em silêncio.
 */
export class FeedbackAmbiguoError extends AppError {
  readonly pedidoDeEsclarecimento: string;

  constructor(pedidoDeEsclarecimento: string) {
    super('feedback_ambiguo', 'feedback insuficiente para virar dado de curadoria');
    this.pedidoDeEsclarecimento = pedidoDeEsclarecimento;
  }
}

/** Converte um `unknown` de `catch` numa mensagem segura para log. */
export function descreverErro(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  }

  return String(e);
}
