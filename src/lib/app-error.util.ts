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

/** Turns an `unknown` from a `catch` into a message that is safe to log. */
export function describeError(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  }

  return String(e);
}
