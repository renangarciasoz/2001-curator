/** One turn of the transcript, reduced to what the interface renders. */
export type TranscriptTurn = {
  author: 'CURATOR' | 'INDICADOR';
  text: string;
};

export type Transcript = {
  readonly turns: readonly TranscriptTurn[];
  /**
   * Whether the Indicador has looked something up at least once here.
   *
   * It is the difference between a question and a recommendation. A turn that
   * only asks carries nothing to review — and letting a curator "evaluate" a
   * question would file that question in the dataset as `ai_recommendation`.
   */
  readonly hasRecommended: boolean;
};

/**
 * Tools whose use means a recommendation was made rather than a question asked.
 *
 * `search_releases` counts even though it reads TMDB and not the archive: a
 * curator correcting what the Indicador picked from the cinema listing is
 * making exactly the judgement this dataset is for. What it searched is a
 * different question from whether it recommended.
 *
 * `record_feedback` is deliberately absent — writing a review is not making one.
 */
export const RECOMMENDATION_TOOLS = [
  'search_films',
  'film_details',
  'search_connections',
  'search_releases',
] as const;

export function isRecommendationTool(name: string): boolean {
  return RECOMMENDATION_TOOLS.some((tool) => tool === name);
}
