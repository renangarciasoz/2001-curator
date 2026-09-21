import 'server-only';

import { SessionNotFoundError } from '@/lib/app-error.util';

import { db } from './db.service';

import type { TranscriptTurn } from '@/lib/transcript.type';
import type Anthropic from '@anthropic-ai/sdk';
import type { Curator, MessageAuthor, Prisma } from '@prisma/client';

type ContentBlock = Anthropic.Beta.BetaContentBlockParam;

export type LoadedSession = {
  readonly sessionId: string;
  readonly curator: Curator;
  readonly profileId: string | null;
  readonly history: readonly Anthropic.Beta.BetaMessageParam[];
};

/** Opens a chat session for a curator, optionally tied to a viewer persona. */
export async function createSession(curator: Curator, profileId: string | null): Promise<string> {
  const session = await db.session.create({
    data: { curator, ...(profileId !== null ? { profileId } : {}) },
    select: { id: true },
  });

  return session.id;
}

/**
 * Loads the session and rebuilds the history in Messages API shape.
 *
 * Blocks are stored raw — text, tool_use, tool_result and reasoning blocks —
 * because the API is stateless and the loop has to hand them back intact on
 * every turn.
 *
 * @throws {SessionNotFoundError} when the session does not exist.
 */
export async function loadSession(sessionId: string): Promise<LoadedSession> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      curator: true,
      profileId: true,
      messages: {
        select: { author: true, blocks: true },
        orderBy: { position: 'asc' },
      },
    },
  });

  if (session === null) {
    throw new SessionNotFoundError(sessionId);
  }

  return {
    sessionId: session.id,
    curator: session.curator,
    profileId: session.profileId,
    history: session.messages.map((message) => ({
      role: message.author === 'INDICADOR' ? ('assistant' as const) : ('user' as const),
      content: readBlocks(message.blocks),
    })),
  };
}

/**
 * The transcript reduced to what the interface renders.
 *
 * Tool and reasoning blocks are left out: the curator wants the conversation,
 * not the plumbing. They remain intact in the database because the loop needs
 * them on every turn.
 */
export async function loadTranscript(sessionId: string): Promise<readonly TranscriptTurn[]> {
  const session = await loadSession(sessionId);

  return session.history.flatMap((message) => {
    const text = extractText(message.content);

    if (text.length === 0) {
      return [];
    }

    return [{ author: message.role === 'assistant' ? 'INDICADOR' : 'CURATOR', text }];
  });
}

function extractText(content: Anthropic.Beta.BetaMessageParam['content']): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

/** Appends a message to the transcript, at the next free position. */
export async function appendMessage(
  sessionId: string,
  author: MessageAuthor,
  blocks: readonly ContentBlock[],
): Promise<void> {
  await db.$transaction(async (tx) => {
    const last = await tx.message.findFirst({
      where: { sessionId },
      select: { position: true },
      orderBy: { position: 'desc' },
    });

    await tx.message.create({
      data: {
        sessionId,
        author,
        // Serialization boundary: Messages API blocks are plain JSON, but the
        // Prisma type for a Json column does not accept them directly.
        blocks: blocks as unknown as object[],
        position: (last?.position ?? -1) + 1,
      },
    });
  });

  await db.session.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
}

/**
 * The context block that enters the system prompt on every turn, after the Method.
 *
 * This is where "ask before recommending" stops depending on the model's good
 * will: what is already known about the person is listed, and what is still
 * missing is listed explicitly as open questions.
 *
 * The text is Portuguese because it is read by the model alongside the Method
 * and shapes a Portuguese conversation.
 */
export async function buildSessionContext(session: LoadedSession): Promise<string> {
  const lines: string[] = [`Quem está conversando com você agora: ${session.curator}.`];

  if (session.profileId === null) {
    lines.push(
      '',
      'Não há perfil de espectador ligado a esta sessão. Você ainda não sabe nada',
      'sobre para quem é a indicação. Perguntas em aberto — faça-as antes de indicar:',
      '  - qual foi o último filme que emocionou a pessoa;',
      '  - se ela busca conforto, desafio ou descoberta;',
      '  - para quem é, que idade tem, como está hoje;',
      '  - que repertório ela já tem.',
    );

    return lines.join('\n');
  }

  const profile = await db.profile.findUnique({
    where: { id: session.profileId },
    select: {
      userId: true,
      likes: true,
      avoids: true,
      repertoire: true,
      lifeMoment: true,
      tier: true,
      watchedFilms: { select: { film: { select: { title: true, year: true } } }, take: 50 },
      journeyHistory: { select: { journey: { select: { title: true } } }, take: 20 },
    },
  });

  if (profile === null) {
    lines.push('', 'O perfil ligado a esta sessão não foi encontrado. Trate como pessoa nova.');

    return lines.join('\n');
  }

  lines.push('', `Espectador desta sessão: ${profile.userId} (tratamento: ${profile.tier}).`);

  const openQuestions: string[] = [];

  addFact(lines, openQuestions, 'Gosta de', profile.likes.join(', '), 'o que ela gosta');
  addFact(lines, openQuestions, 'Evita', profile.avoids.join(', '), 'o que ela evita');
  addFact(lines, openQuestions, 'Repertório', profile.repertoire ?? '', 'que repertório ela tem');
  addFact(lines, openQuestions, 'Momento de vida', profile.lifeMoment ?? '', 'como ela está hoje');

  const watched = profile.watchedFilms
    .map((item) => {
      const year = item.film.year !== null ? ` (${String(item.film.year)})` : '';

      return `${item.film.title}${year}`;
    })
    .join('; ');

  addFact(lines, openQuestions, 'Já assistiu', watched, 'o que ela já viu');

  const journeys = profile.journeyHistory.map((item) => item.journey.title).join('; ');

  if (journeys.length > 0) {
    lines.push(`Jornadas por onde já passou: ${journeys}`);
  }

  if (openQuestions.length > 0) {
    lines.push('', 'Perguntas em aberto — resolva antes de indicar:');
    lines.push(...openQuestions.map((question) => `  - ${question};`));
  } else {
    lines.push('', 'Há contexto suficiente sobre esta pessoa. Pode indicar com justificativa.');
  }

  return lines.join('\n');
}

function addFact(
  lines: string[],
  openQuestions: string[],
  label: string,
  value: string,
  questionIfMissing: string,
): void {
  if (value.trim().length === 0) {
    openQuestions.push(questionIfMissing);
    return;
  }

  lines.push(`${label}: ${value}`);
}

/**
 * Turns the Postgres JSON back into content blocks.
 *
 * Deserialization boundary: the database returns `JsonValue`, and whatever was
 * written there always came from the Messages API itself. An empty array is the
 * safe degradation if a row is corrupt — better an empty message than an
 * exception that takes down the whole session.
 */
function readBlocks(value: Prisma.JsonValue): ContentBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value as unknown as ContentBlock[];
}
