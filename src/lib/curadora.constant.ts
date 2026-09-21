/**
 * As duas curadoras da 2001. Vocabulário compartilhado entre servidor e front:
 * o front precisa dele para o seletor de login e para a interface de correção.
 *
 * `AMBAS` e `DEMO` existem no banco mas não são pessoas que fazem login —
 * `AMBAS` é o resultado de uma avaliação conjunta, `DEMO` marca dado de
 * demonstração. Por isso ficam fora desta lista.
 */
export const CURADORAS = ['SONIA', 'MIRELLA'] as const;

export type Curadora = (typeof CURADORAS)[number];

export function ehCuradora(valor: string): valor is Curadora {
  return CURADORAS.some((curadora) => curadora === valor);
}

/** Nome como ele aparece na interface. */
export function nomeDaCuradora(curadora: string): string {
  switch (curadora) {
    case 'SONIA':
      return 'Sonia';
    case 'MIRELLA':
      return 'Mirella';
    case 'AMBAS':
      return 'Sonia e Mirella';
    case 'DEMO':
      return 'demonstração';
    default:
      return curadora;
  }
}
