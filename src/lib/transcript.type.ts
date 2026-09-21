/** One turn of the transcript, reduced to what the interface renders. */
export type TranscriptTurn = {
  author: 'CURATOR' | 'INDICADOR';
  text: string;
};
