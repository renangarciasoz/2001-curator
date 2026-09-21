import 'server-only';

import { toIso8601Utc } from '@/lib/date.util';
import { METHOD_VERSION } from '@/method/system-prompt.constant';

import { db } from './db.service';

const PAGE_SIZE = 200;

/**
 * How the Phase 2 dataset sees a film.
 *
 * Identity (title, year) goes in by reference — without it the record is
 * unreadable. Third-party prose does not go in at all: TMDB synopses, posters
 * and any other text from the external bucket are absent from the file by
 * construction. The curators' study goes in whole, and only when it is real
 * curation — demonstration data never crosses.
 */
type ExportedFilm = {
  film_id: string;
  title: string;
  year: number | null;
  emotional_tone: string | null;
  what_it_provokes: string | null;
  commercial_register: string | null;
  curatorial_notes: string | null;
  historical_context: string | null;
  archive_category: string | null;
};

export type DatasetLine = {
  id: string;
  method_version: number;
  recorded_at: string;
  user_request: string;
  ai_questions: unknown;
  ai_recommendation: string;
  correction: string | null;
  correction_reason: string | null;
  reviewed_by: string | null;
  consensus: string | null;
  confidence: string | null;
  recommended_films: readonly ExportedFilm[];
  corrected_films: readonly ExportedFilm[];
  provenance: {
    bucket: 'curation_2001';
    trainable: true;
    third_party_prose_included: false;
    note: string;
  };
};

const PROVENANCE_NOTE =
  "The 2001 archive's own content. Each film's title and year are included only as " +
  'identification; no synopsis, image or text from a public database was included.';

/**
 * Exports the curatorial dataset, one JSON line per conversation.
 *
 * Only what the quality gate absorbed comes out. Conversations in REVIEW are
 * deliberately left out: a disagreement between Sonia and Mirella is valuable
 * data but it is not a label — training on it would teach the model to pick a
 * side the curators did not pick.
 *
 * Generated on demand, paginated by cursor: the file can grow without bound and
 * never has to fit in memory.
 */
export async function* exportDatasetJsonl(): AsyncGenerator<string> {
  let cursor: string | undefined;

  for (;;) {
    const page = await db.conversation.findMany({
      where: { quality: 'ABSORB' },
      select: {
        id: true,
        userRequest: true,
        aiQuestions: true,
        aiRecommendation: true,
        correction: true,
        correctionReason: true,
        reviewedBy: true,
        consensus: true,
        confidence: true,
        createdAt: true,
        films: {
          select: {
            role: true,
            position: true,
            film: {
              select: {
                id: true,
                title: true,
                year: true,
                emotionalTone: true,
                whatItProvokes: true,
                commercialRegister: true,
                curatorialNotes: true,
                historicalContext: true,
                archiveCategory: true,
                curatorialSource: true,
              },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (page.length === 0) {
      return;
    }

    for (const conversation of page) {
      yield `${JSON.stringify(buildLine(conversation))}\n`;
    }

    cursor = page[page.length - 1]?.id;

    if (cursor === undefined || page.length < PAGE_SIZE) {
      return;
    }
  }
}

/** How many conversations the file would hold right now. */
export function countDatasetLines(): Promise<number> {
  return db.conversation.count({ where: { quality: 'ABSORB' } });
}

type ConversationWithFilms = {
  id: string;
  userRequest: string;
  aiQuestions: unknown;
  aiRecommendation: string;
  correction: string | null;
  correctionReason: string | null;
  reviewedBy: string | null;
  consensus: string | null;
  confidence: string | null;
  createdAt: Date;
  films: readonly {
    role: string;
    film: {
      id: string;
      title: string;
      year: number | null;
      emotionalTone: string | null;
      whatItProvokes: string | null;
      commercialRegister: string | null;
      curatorialNotes: string | null;
      historicalContext: string | null;
      archiveCategory: string | null;
      curatorialSource: string | null;
    };
  }[];
};

function buildLine(conversation: ConversationWithFilms): DatasetLine {
  return {
    id: conversation.id,
    method_version: METHOD_VERSION,
    recorded_at: toIso8601Utc(conversation.createdAt),
    user_request: conversation.userRequest,
    ai_questions: conversation.aiQuestions,
    ai_recommendation: conversation.aiRecommendation,
    correction: conversation.correction,
    correction_reason: conversation.correctionReason,
    reviewed_by: conversation.reviewedBy,
    consensus: conversation.consensus,
    confidence: conversation.confidence,
    recommended_films: projectFilms(conversation, 'RECOMMENDED_BY_AI'),
    corrected_films: projectFilms(conversation, 'CORRECTED_BY_CURATOR'),
    provenance: {
      bucket: 'curation_2001',
      trainable: true,
      third_party_prose_included: false,
      note: PROVENANCE_NOTE,
    },
  };
}

function projectFilms(conversation: ConversationWithFilms, role: string): readonly ExportedFilm[] {
  return conversation.films
    .filter((link) => link.role === role)
    .map(({ film }) => {
      // Without real curation only the identification crosses: demonstration
      // data must never pass for the curators' study in training.
      const is2001Curation = film.curatorialSource === 'CURATION_2001';

      return {
        film_id: film.id,
        title: film.title,
        year: film.year,
        emotional_tone: is2001Curation ? film.emotionalTone : null,
        what_it_provokes: is2001Curation ? film.whatItProvokes : null,
        commercial_register: is2001Curation ? film.commercialRegister : null,
        curatorial_notes: is2001Curation ? film.curatorialNotes : null,
        historical_context: is2001Curation ? film.historicalContext : null,
        archive_category: is2001Curation ? film.archiveCategory : null,
      };
    });
}
