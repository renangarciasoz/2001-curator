import 'server-only';

import { AmbiguousFeedbackError, AppError, describeError } from '@/lib/app-error.util';

import { FilmDetailsInputSchema, filmDetails } from './film-details.service';
import { RecordFeedbackInputSchema, recordFeedback } from './record-feedback.service';
import { SearchConnectionsInputSchema, searchConnections } from './search-connections.service';
import { SearchFilmsInputSchema, searchFilms } from './search-films.service';

export type ToolResult = {
  /** Serialized JSON, ready to become the content of a `tool_result` block. */
  content: string;
  /** Marks the block with `is_error` so the model knows it must change course. */
  isError: boolean;
};

/** Context the application injects and the model neither needs nor should invent. */
export type ToolContext = {
  readonly sessionId: string;
  readonly profileId: string | null;
};

/**
 * Executes a tool called by the Indicador.
 *
 * Arguments come from the model and are untrusted input: each one passes
 * through its tool's Zod schema before reaching the domain. A domain error
 * becomes a `tool_result` with `is_error`, never an exception that kills the
 * conversation — the model can read the message and try again.
 */
export async function executeTool(
  name: string,
  args: unknown,
  context: ToolContext,
  signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    return { content: await dispatch(name, args, context, signal), isError: false };
  } catch (e) {
    return { content: JSON.stringify(describeFailure(e)), isError: true };
  }
}

async function dispatch(
  name: string,
  args: unknown,
  context: ToolContext,
  signal?: AbortSignal,
): Promise<string> {
  switch (name) {
    case 'search_films': {
      const input = SearchFilmsInputSchema.parse(args);

      return JSON.stringify({ candidates: await searchFilms(input, signal) });
    }

    case 'film_details': {
      const input = FilmDetailsInputSchema.parse(args);

      return JSON.stringify(await filmDetails(input));
    }

    case 'search_connections': {
      const input = SearchConnectionsInputSchema.parse(args);

      return JSON.stringify({ connections: await searchConnections(input) });
    }

    case 'record_feedback': {
      const input = RecordFeedbackInputSchema.parse(args);

      // The session belongs to whoever is signed in, not to whoever the model says.
      return JSON.stringify(
        await recordFeedback({
          ...input,
          session_id: context.sessionId,
          ...(context.profileId !== null ? { profile_id: context.profileId } : {}),
        }),
      );
    }

    default:
      throw new AppError('unknown_tool', `tool "${name}" does not exist`);
  }
}

function describeFailure(e: unknown): Record<string, unknown> {
  if (e instanceof AmbiguousFeedbackError) {
    return {
      error: e.code,
      nothing_was_written: true,
      // Portuguese: the model relays this question straight to the curator.
      ask_the_curator: e.clarificationRequest,
    };
  }

  if (e instanceof AppError) {
    return { error: e.code, message: e.message };
  }

  return { error: 'unexpected_failure', message: describeError(e) };
}
