/**
 * A taxonomia do acervo, espelhando a estrutura de pastas da curadoria da 2001.
 *
 * Os valores são os mesmos do enum `CategoriaAcervo` no Postgres. Acrescentar
 * uma categoria exige migration — é vocabulário, não texto livre, justamente
 * para que a organização do conhecimento não derive com o tempo.
 */
export const CATEGORIAS_DO_ACERVO = [
  'HISTORIA_DA_EMPRESA',
  'METODO_DE_TREINAMENTO',
  'CURADORIA',
  'CLIPPING',
  'ENTREVISTAS',
  'REVISTAS_2001',
  'CURSOS',
  'LISTA_OMO',
  'ATENDIMENTO_E_CASOS_REAIS',
  'TEXTOS_DA_SONIA',
  'PREMIACOES',
  'MARKETING_E_EVENTOS',
] as const;

export type CategoriaDoAcervo = (typeof CATEGORIAS_DO_ACERVO)[number];

const NOMES: Readonly<Record<CategoriaDoAcervo, string>> = {
  HISTORIA_DA_EMPRESA: 'História da empresa',
  METODO_DE_TREINAMENTO: 'Método de treinamento',
  CURADORIA: 'Curadoria',
  CLIPPING: 'Clipping',
  ENTREVISTAS: 'Entrevistas',
  REVISTAS_2001: 'Revistas 2001',
  CURSOS: 'Cursos',
  LISTA_OMO: 'Lista OMO',
  ATENDIMENTO_E_CASOS_REAIS: 'Atendimento e casos reais',
  TEXTOS_DA_SONIA: 'Textos da Sonia',
  PREMIACOES: 'Premiações',
  MARKETING_E_EVENTOS: 'Marketing e eventos',
};

export function nomeDaCategoria(categoria: string): string {
  return Reflect.get(NOMES, categoria) ?? categoria;
}
