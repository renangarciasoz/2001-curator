/** One turn of the transcript, reduced to what the interface renders. */
export type TranscriptTurn = {
  author: 'CURATOR' | 'INDICADOR';
  text: string;
};

export type Transcript = {
  readonly turns: readonly TranscriptTurn[];
  /**
   * Whether the Indicador has consulted the archive at least once here.
   *
   * It is the difference between a question and a recommendation. The Method
   * has it open every conversation by asking, so an early turn carries no
   * recommendation to review — and letting a curator "evaluate" a question
   * would file that question in the dataset as `ai_recommendation`.
   */
  readonly hasRecommended: boolean;
};

/**
 * Tools that mean the Indicador went to the archive. `record_feedback` is
 * deliberately absent: writing a review is not making one.
 */
export const ARCHIVE_TOOLS = ['search_films', 'film_details', 'search_connections'] as const;

export function isArchiveTool(name: string): boolean {
  return ARCHIVE_TOOLS.some((tool) => tool === name);
}
