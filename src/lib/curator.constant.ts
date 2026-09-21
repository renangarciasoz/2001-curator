/**
 * The two curators of the 2001 archive. Shared vocabulary between server and
 * browser: the front end needs it for the login picker and the correction panel.
 *
 * `BOTH` and `DEMO` exist in the database but are not people who log in —
 * `BOTH` is the outcome of a joint review, `DEMO` marks demonstration data.
 * That is why they are not in this list.
 */
export const CURATORS = ['SONIA', 'MIRELLA'] as const;

export type CuratorName = (typeof CURATORS)[number];

export function isCurator(value: string): value is CuratorName {
  return CURATORS.some((curator) => curator === value);
}

/**
 * Display name, in Portuguese — this is product copy the curators read.
 */
export function curatorLabel(curator: string): string {
  switch (curator) {
    case 'SONIA':
      return 'Sonia';
    case 'MIRELLA':
      return 'Mirella';
    case 'BOTH':
      return 'Sonia e Mirella';
    case 'DEMO':
      return 'demonstração';
    default:
      return curator;
  }
}
