import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import {
  AmbiguousFeedbackError,
  AppError,
  ConversationNotFoundError,
  CuratorNotAuthenticatedError,
  FilmNotFoundError,
  InvalidConfigurationError,
  ProviderUnavailableError,
  SessionNotFoundError,
  describeError,
} from '@/lib/app-error.util';

/**
 * Translates a domain error into an HTTP response.
 *
 * Error classes carry English, developer-facing messages; what goes over the
 * wire is the stable `error` code plus a Portuguese sentence the interface can
 * render as-is. No unexpected exception message ever reaches the client — the
 * detail stays in the server log.
 */
export function respondError(e: unknown): NextResponse {
  if (e instanceof CuratorNotAuthenticatedError) {
    return NextResponse.json(
      { error: e.code, message: 'Entre como Sonia ou Mirella para continuar.' },
      { status: 401 },
    );
  }

  if (e instanceof AmbiguousFeedbackError) {
    // 422: the request is well-formed, but the quality gate did not let it
    // through. The interface turns this into a question for the curator.
    return NextResponse.json(
      {
        error: e.code,
        message: 'O feedback ainda não é suficiente para virar dado.',
        clarificationRequest: e.clarificationRequest,
        nothingWasWritten: true,
      },
      { status: 422 },
    );
  }

  if (e instanceof FilmNotFoundError) {
    return NextResponse.json(
      { error: e.code, message: 'Este filme não está no acervo.' },
      { status: 404 },
    );
  }

  if (e instanceof SessionNotFoundError) {
    return NextResponse.json(
      { error: e.code, message: 'Esta conversa não está disponível.' },
      { status: 404 },
    );
  }

  if (e instanceof ConversationNotFoundError) {
    return NextResponse.json(
      { error: e.code, message: 'Esta avaliação não foi encontrada.' },
      { status: 404 },
    );
  }

  if (e instanceof ProviderUnavailableError) {
    console.error(`Provider ${e.provider} unavailable: ${e.message}`);

    return NextResponse.json(
      { error: e.code, message: 'Um serviço externo não respondeu. Tente de novo.' },
      { status: 503 },
    );
  }

  if (e instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'invalid_input',
        message: 'Dados inválidos.',
        fields: e.issues.map((issue) => ({
          field: issue.path.join('.'),
          problem: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  // A missing setting is the operator's problem, not the curator's. Saying so
  // beats "check your password" when there is no password to check.
  if (e instanceof InvalidConfigurationError) {
    console.error(e.message);

    return NextResponse.json(
      {
        error: e.code,
        message: 'A aplicação não está configurada. Avise quem cuida do deploy.',
      },
      { status: 503 },
    );
  }

  if (e instanceof AppError) {
    console.error(`Domain error ${e.code}: ${e.message}`);

    return NextResponse.json(
      { error: e.code, message: 'Não foi possível concluir esta ação.' },
      { status: 400 },
    );
  }

  console.error(`Unhandled failure: ${describeError(e)}`);

  return NextResponse.json(
    { error: 'unexpected_failure', message: 'Algo deu errado. Tente de novo.' },
    { status: 500 },
  );
}
