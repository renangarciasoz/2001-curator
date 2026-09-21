-- Invariantes do Método, no banco.
--
-- Estas CHECK constraints não são representáveis em schema.prisma — o Prisma não
-- modela CHECK — e por isso vivem numa migration própria. Elas existem porque as
-- duas regras que mais importam para o valor do dataset não podem depender só da
-- camada de aplicação: uma correção sem porquê, ou uma divergência silenciada,
-- corrompe o dado de treino da Fase 2 de forma irreversível.
--
-- `prisma migrate diff` não enxerga CHECK constraints, então elas não aparecem
-- como drift. Confirmar a existência delas é responsabilidade de teste, não do diff.

-- O porquê da ponte é obrigatório e não pode ser espaço em branco.
ALTER TABLE "conexao"
  ADD CONSTRAINT "conexao_porque_nao_vazio"
  CHECK (btrim("porque") <> '');

ALTER TABLE "conexao"
  ADD CONSTRAINT "conexao_ponte_por_nao_vazio"
  CHECK (btrim("ponte_por") <> '');

-- Uma ponte liga dois filmes diferentes.
ALTER TABLE "conexao"
  ADD CONSTRAINT "conexao_origem_diferente_de_destino"
  CHECK ("filme_origem_id" <> "filme_destino_id");

-- Toda posição numa jornada carrega o porquê de estar ali.
ALTER TABLE "jornada_filme"
  ADD CONSTRAINT "jornada_filme_nota_do_porque_nao_vazia"
  CHECK (btrim("nota_do_porque") <> '');

-- Toda entrada de lista editorial carrega a sua linha de curadoria.
ALTER TABLE "lista_editorial_filme"
  ADD CONSTRAINT "lista_editorial_filme_linha_nao_vazia"
  CHECK (btrim("linha_de_curadoria") <> '');

-- Correção sem justificativa é dado quase inútil: o schema recusa.
ALTER TABLE "conversa"
  ADD CONSTRAINT "conversa_correcao_exige_porque"
  CHECK (
    "correcao" IS NULL
    OR ("porque_da_correcao" IS NOT NULL AND btrim("porque_da_correcao") <> '')
  );

-- Divergência entre as duas curadoras nunca é silenciada, e nunca elege um
-- vencedor: as duas leituras ficam registradas e `correcao` permanece nula.
ALTER TABLE "conversa"
  ADD CONSTRAINT "conversa_divergencia_registra_as_duas_leituras"
  CHECK (
    "consenso" IS DISTINCT FROM 'DIVERGENCIA'
    OR (
      "nota_da_divergencia" IS NOT NULL
      AND btrim("nota_da_divergencia") <> ''
      AND "correcao" IS NULL
    )
  );

-- Divergência não vira dado de treino sem revisão humana.
ALTER TABLE "conversa"
  ADD CONSTRAINT "conversa_divergencia_e_sempre_revisar"
  CHECK (
    "consenso" IS DISTINCT FROM 'DIVERGENCIA'
    OR "qualidade" = 'REVISAR'
  );

-- Todo feedback absorvido declara o seu nível de confiança.
ALTER TABLE "conversa"
  ADD CONSTRAINT "conversa_absorve_exige_confianca"
  CHECK (
    "qualidade" IS DISTINCT FROM 'ABSORVE'
    OR "confianca" IS NOT NULL
  );

-- Rastreabilidade da curadoria: camada curatorial da 2001 sempre diz quem avaliou,
-- e DEMO (dado de demonstração) nunca se disfarça de curadoria real.
ALTER TABLE "filme"
  ADD CONSTRAINT "filme_curadoria_real_declara_avaliador"
  CHECK (
    "fonte_curatorial" IS DISTINCT FROM 'CURADORIA_2001'
    OR (
      array_length("avaliado_por", 1) IS NOT NULL
      AND NOT ('DEMO' = ANY ("avaliado_por"))
    )
  );

ALTER TABLE "filme"
  ADD CONSTRAINT "filme_demo_nao_se_passa_por_curadoria"
  CHECK (
    "fonte_curatorial" IS DISTINCT FROM 'DEMO'
    OR NOT (
      'SONIA' = ANY ("avaliado_por")
      OR 'MIRELLA' = ANY ("avaliado_por")
      OR 'AMBAS' = ANY ("avaliado_por")
    )
  );
