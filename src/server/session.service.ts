import 'server-only';

import { SessionNotFoundError } from '@/lib/app-error.util';
import { isArchiveTool } from '@/lib/transcript.type';

import { db } from './db.service';

import type { Transcript, TranscriptTurn } from '@/lib/transcript.type';
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
export async function loadTranscript(sessionId: string): Promise<Transcript> {
  const session = await loadSession(sessionId);

  const turns = session.history.flatMap<TranscriptTurn>((message) => {
    const text = extractText(message.content);

    if (text.length === 0) {
      return [];
    }

    return [{ author: message.role === 'assistant' ? 'INDICADOR' : 'CURATOR', text }];
  });

  return { turns, hasRecommended: session.history.some(consultedArchive) };
}

/** How long an opening line stays before the list starts wrapping badly. */
const OPENING_LENGTH = 140;

export type SessionSummary = {
  readonly sessionId: string;
  readonly persona: string | null;
  /** The curator's first message — what the conversation is recognisably about. */
  readonly opening: string;
  readonly turns: number;
  readonly lastActivity: Date;
};

/**
 * The curator's recent conversations, most recently touched first.
 *
 * Without this the only way back into a session is its UUID in the URL, which
 * means closing the tab loses the conversation in practice even though every
 * message is on disk.
 *
 * Sessions that were opened and never used are left out: they are an artifact
 * of clicking the button, not work anyone wants to return to.
 */
export async function listSessions(
  curator: Curator,
  limit = 20,
): Promise<readonly SessionSummary[]> {
  const sessions = await db.session.findMany({
    where: { curator, messages: { some: {} } },
    select: {
      id: true,
      updatedAt: true,
      profile: { select: { userId: true } },
      messages: { select: { blocks: true }, orderBy: { position: 'asc' }, take: 1 },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  return sessions.map((session) => ({
    sessionId: session.id,
    persona: session.profile?.userId ?? null,
    opening: summarize(session.messages[0]?.blocks),
    turns: session._count.messages,
    lastActivity: session.updatedAt,
  }));
}

export type SessionDeletion = {
  /** Reviews that were recorded here and stay in the dataset, now unlinked. */
  readonly reviewsKept: number;
};

/**
 * Deletes a conversation and its messages.
 *
 * What it does *not* delete is the point: reviews recorded in this session are
 * rows in `conversation`, and the foreign key is `ON DELETE SET NULL`. They
 * survive with `session_id` null. A curator throwing away a messy chat must not
 * be able to throw away the reasons she wrote down in it — that is the only
 * thing this project is accumulating.
 *
 * Purging reviews is possible, but only from the terminal, deliberately: see
 * `scripts/cleanup.ts`.
 *
 * @throws {SessionNotFoundError} when the session does not exist or belongs to
 *   the other curator — the two are the same answer on purpose, so this cannot
 *   be used to probe for someone else's session ids.
 */
export async function deleteSession(sessionId: string, curator: Curator): Promise<SessionDeletion> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { curator: true, _count: { select: { conversations: true } } },
  });

  if (session === null || session.curator !== curator) {
    throw new SessionNotFoundError(sessionId);
  }

  // Messages cascade; conversations detach. Both are declared in the schema.
  await db.session.delete({ where: { id: sessionId } });

  return { reviewsKept: session._count.conversations };
}

function summarize(blocks: Prisma.JsonValue | undefined): string {
  if (blocks === undefined) {
    return 'Conversa sem abertura registrada';
  }

  const text = extractText(readBlocks(blocks));

  if (text.length <= OPENING_LENGTH) {
    return text;
  }

  return `${text.slice(0, OPENING_LENGTH).trimEnd()}…`;
}

/** Did this message reach for the archive? Tool blocks survive the reload; text alone does not. */
function consultedArchive(message: Anthropic.Beta.BetaMessageParam): boolean {
  if (typeof message.content === 'string') {
    return false;
  }

  return message.content.some((block) => block.type === 'tool_use' && isArchiveTool(block.name));
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
      'Não há perfil de espectador ligado a esta sessão: tudo o que você sabe sobre',
      'esta pessoa está na própria conversa. Leia-a antes de perguntar qualquer',
      'coisa — o que ela já disse não se pergunta de novo.',
      '',
      'Se a porta for objetiva (diretor, gênero, país, época, um filme de',
      'referência), indique com o que ela deu. Se for aberta, levante o que ainda',
      'muda a escolha: faixa etária, o que já viu do que procura e o que achou, o',
      'que prefere evitar, e o que quer hoje — rir, se emocionar, pensar,',
      'descobrir.',
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
    lines.push(
      '',
      'Ainda não se sabe, sobre esta pessoa. Pergunte apenas o que puder mudar esta',
      'indicação — e nada disso, se a procura dela já for objetiva o bastante:',
    );
    lines.push(...openQuestions.map((question) => `  - ${question};`));
  } else {
    lines.push('', 'Há contexto suficiente sobre esta pessoa. Indique direto, com o porquê.');
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
