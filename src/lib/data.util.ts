/**
 * Serializa um instante na forma que todo payload deste projeto carrega:
 * ISO 8601 em UTC com offset explícito `+00:00`.
 *
 * O sufixo `Z` seria igualmente válido em RFC 3339, mas uma forma só entre
 * todos os produtores é o que permite a um consumidor analisar sem casos
 * especiais por origem.
 */
export function paraIso8601Utc(instante: Date): string {
  return instante.toISOString().replace('Z', '+00:00');
}
