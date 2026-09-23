/**
 * Base class for every domain error in the Indicador.
 *
 * `code` is stable and drives log correlation and the HTTP status mapping.
 * Messages here are developer-facing and in English; the Portuguese text the
 * curators read is produced at the HTTP boundary and in the UI.
 */
export class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = this.constructor.name;
  }
}

/** A required environment variable is missing or malformed. */
export class InvalidConfigurationError extends AppError {
  constructor(detail: string, options?: ErrorOptions) {
    super('invalid_configuration', `invalid configuration: ${detail}`, options);
  }
}

/** An external provider (TMDB, embeddings, Anthropic) failed or refused. */
export class ProviderUnavailableError extends AppError {
  readonly provider: string;

  constructor(provider: string, detail: string, options?: ErrorOptions) {
    super('provider_unavailable', `${provider} unavailable: ${detail}`, options);
    this.provider = provider;
  }
}

export class FilmNotFoundError extends AppError {
  constructor(filmId: string) {
    super('film_not_found', `film ${filmId} is not in the archive`);
  }
}

export class SessionNotFoundError extends AppError {
  constructor(sessionId: string) {
    super('session_not_found', `session ${sessionId} does not exist`);
  }
}

export class ConversationNotFoundError extends AppError {
  constructor(conversationId: string) {
    super('conversation_not_found', `conversation ${conversationId} does not exist`);
  }
}

/** No curator is signed in, or the shared curation password did not match. */
export class CuratorNotAuthenticatedError extends AppError {
  constructor(detail = 'no curator identified in this session') {
    super('curator_not_authenticated', detail);
  }
}

/**
 * The feedback arrived too thin or too ambiguous to become data.
 *
 * Not a technical failure: this is the quality gate asking for clarification
 * before writing. Whoever catches it must ask, never discard silently.
 */
export class AmbiguousFeedbackError extends AppError {
  /**
   * The question to put to the curator, in Brazilian Portuguese.
   *
   * Deliberately not English: this string is shown to Sonia and Mirella and is
   * also handed to the model so it can ask them in their own language.
   */
  readonly clarificationRequest: string;

  constructor(clarificationRequest: string) {
    super('ambiguous_feedback', 'feedback is insufficient to become curation data');
    this.clarificationRequest = clarificationRequest;
  }
}

/**
 * Turns an `unknown` from a `catch` into a message that is safe to log.
 *
 * The `cause` chain is followed because `fetch` is the main way this project
 * talks to anything, and every network failure it has arrives as the same three
 * words: "fetch failed". What actually happened — ENOTFOUND, ECONNREFUSED,
 * ETIMEDOUT, a certificate rejection — is one level down, in the cause. Dropping
 * it turns four different problems, with four different fixes, into one
 * unactionable string.
 *
 * Causes are appended, not substituted: the outer message says which operation
 * failed, and the inner one says why.
 */
export function describeError(e: unknown): string {
  if (!(e instanceof Error)) {
    return String(e);
  }

  const parts: string[] = [e.message];
  let current: unknown = e.cause;

  // Bounded: a cause chain is normally one or two deep, and a cyclic one must
  // not hang the logger.
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const code: unknown = Reflect.get(current, 'code');
    const detail = typeof code === 'string' ? `${code}: ${current.message}` : current.message;

    // A wrapper that already quoted its cause ("qdrant unavailable: fetch
    // failed") should not repeat it.
    if (!parts.some((part) => part.includes(detail))) {
      parts.push(detail);
    }

    current = current.cause;
  }

  return parts.join(' — ');
}
