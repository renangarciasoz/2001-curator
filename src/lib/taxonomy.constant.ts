/**
 * The archive taxonomy, mirroring the curators' folder structure.
 *
 * The values match the `ArchiveCategory` enum in Postgres. Adding a category
 * requires a migration — this is vocabulary, not free text, precisely so the
 * organisation of the knowledge does not drift over time.
 */
export const ARCHIVE_CATEGORIES = [
  'COMPANY_HISTORY',
  'TRAINING_METHOD',
  'CURATION',
  'CLIPPING',
  'INTERVIEWS',
  'MAGAZINES_2001',
  'COURSES',
  'OMO_LIST',
  'SERVICE_AND_REAL_CASES',
  'SONIA_TEXTS',
  'AWARDS',
  'MARKETING_AND_EVENTS',
] as const;

export type ArchiveCategoryName = (typeof ARCHIVE_CATEGORIES)[number];

/** Display labels, in Portuguese — product copy the curators read. */
const LABELS: Readonly<Record<ArchiveCategoryName, string>> = {
  COMPANY_HISTORY: 'História da empresa',
  TRAINING_METHOD: 'Método de treinamento',
  CURATION: 'Curadoria',
  CLIPPING: 'Clipping',
  INTERVIEWS: 'Entrevistas',
  MAGAZINES_2001: 'Revistas 2001',
  COURSES: 'Cursos',
  OMO_LIST: 'Lista OMO',
  SERVICE_AND_REAL_CASES: 'Atendimento e casos reais',
  SONIA_TEXTS: 'Textos da Sonia',
  AWARDS: 'Premiações',
  MARKETING_AND_EVENTS: 'Marketing e eventos',
};

export function isArchiveCategory(value: string): value is ArchiveCategoryName {
  return ARCHIVE_CATEGORIES.some((category) => category === value);
}

export function archiveCategoryLabel(category: string): string {
  return isArchiveCategory(category) ? LABELS[category] : category;
}
