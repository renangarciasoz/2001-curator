/**
 * How a film reaches the Indicador (and the front end).
 *
 * Keys are `snake_case` because this crosses a boundary: it becomes JSON inside
 * a Messages API `tool_result` and a Route Handler response.
 *
 * The two buckets stay separate and labelled here. `factual_source` says where
 * the record came from; `curatorial_source` says whether the study is the 2001
 * archive's or demonstration data. The Indicador is instructed not to treat
 * demonstration data as curation.
 */
export type FilmForIndicador = {
  film_id: string;

  // ── factual record (third-party lookup) ──
  title: string;
  original_title: string | null;
  year: number | null;
  director: string | null;
  country: string | null;
  factual_synopsis: string | null;
  factual_source: string;

  // ── 2001 curatorial layer ──
  emotional_tone: string | null;
  what_it_provokes: string | null;
  commercial_register: string | null;
  archive_category: string | null;
  curatorial_notes: string | null;
  historical_context: string | null;
  reviewed_by: readonly string[];
  curatorial_source: string | null;
  /** `false` when the curators have not studied this film yet. */
  has_2001_curation: boolean;
};

/** A candidate returned by semantic search, with its closeness score. */
export type FilmCandidateForIndicador = FilmForIndicador & {
  closeness: number;
};

/** A bridge between two films, as the Indicador receives it. */
export type ConnectionForIndicador = {
  connection_id: string;
  type: string;
  bridged_by: string;
  why: string;
  curator: string;
  target_film: {
    film_id: string;
    title: string;
    year: number | null;
    director: string | null;
  };
};
