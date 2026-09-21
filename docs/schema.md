# O modelo de dados

Fonte da verdade: [`prisma/schema.prisma`](../prisma/schema.prisma). Este
documento explica a intenção por trás de cada entidade — o que o schema não
consegue dizer sozinho.

Convenções que valem para todas as tabelas: colunas em `snake_case`, atributos
na ordem PK → FKs → identificadores secundários → domínio → derivados → status →
flags → timestamps, e todo timestamp em `TIMESTAMPTZ(6)`.

---

## Acervo

### `filme`

Uma linha por filme, com **dois blocos de colunas que não se misturam**.

**Camada factual** (balde de terceiros — consulta, nunca treino):
`titulo`, `titulo_original`, `ano`, `diretor`, `pais`, `sinopse_factual`,
`poster_path`, e `fonte_factual` (`TMDB` | `FIXTURE_DEV`).

**Camada curatorial 2001** (o diferencial — material treinável):

| Coluna | O que carrega |
|---|---|
| `tom_emocional` | `conforta`, `desafia`, `destrói`, … — texto livre de propósito: o vocabulário é das curadoras, não do schema |
| `o_que_provoca` | O que o filme faz com o espectador |
| `registro_comercial` | `COMERCIAL` \| `CABECA` \| `AMBOS` — descrição, não julgamento. Todo filme é filme |
| `notas_curatoriais` | O estudo de meses. Texto livre |
| `contexto_historico` | Por que importa na história do cinema |
| `categoria_acervo` | Etiqueta da taxonomia (abaixo) |
| `avaliado_por` | Lista: `SONIA`, `MIRELLA`, `AMBAS` |
| `fonte_curatorial` | `CURADORIA_2001` \| `DEMO` |

`indexado_em` é controle do índice vetorial: nulo significa "o vetor no Qdrant
está velho". A ingestão e o seed zeram esse campo ao mudar qualquer texto que
alimenta o embedding.

**Constraints que valem a pena conhecer:**

- `filme_curadoria_real_declara_avaliador` — se `fonte_curatorial =
  CURADORIA_2001`, `avaliado_por` não pode estar vazio nem conter `DEMO`.
- `filme_demo_nao_se_passa_por_curadoria` — se `fonte_curatorial = DEMO`,
  `avaliado_por` não pode conter `SONIA`, `MIRELLA` ou `AMBAS`.

### `conexao` — o coração do Método

Uma ponte dirigida entre dois filmes.

| Coluna | O que carrega |
|---|---|
| `filme_origem_id`, `filme_destino_id` | De onde para onde |
| `tipo` | `PORTA_DE_ENTRADA`, `SE_GOSTOU_DE`, `ANTES_DE_VER`, `LANCAMENTO_PARA_ACERVO`, `ACERVO_PARA_LANCAMENTO`, `OUTRO` |
| `ponte_por` | `gênero`, `elenco`, `direção`, `tema`, … — texto livre |
| `porque` | **OBRIGATÓRIO.** A razão da ponte, nas palavras da curadora |
| `curador` | Quem estabeleceu |

`conexao_porque_nao_vazio` recusa string vazia ou só espaços — `NOT NULL` sozinho
deixaria passar `''`. `conexao_origem_diferente_de_destino` impede a ponte
degenerada.

Unicidade em `(origem, destino, tipo)`: os mesmos dois filmes podem ter mais de
uma ponte, desde que por tipos diferentes.

### `jornada` / `jornada_filme`

Trilha formativa atemporal — "Começando Kurosawa". `objetivo` descreve **que
espectador ela forma**, não o que ela contém. Cada item tem `ordem` (única
dentro da jornada) e `nota_do_porque`: por que este filme, **nesta posição**.

### `lista_editorial` / `lista_editorial_filme`

Lista recorrente e datada, herdeira da Lista OMO. `periodo` é mês ou temporada
(`2026-03`, `Mostra de SP 2026`); `tipo` é `TOP_DO_MES`, `TEMATICO`, `EVENTO` ou
`OMO_HISTORICA`. Cada entrada carrega uma `linha_de_curadoria`.

A diferença para `jornada`: jornada é atemporal e forma; lista é datada e publica.

---

## Conversa e feedback

### `sessao` e `mensagem`

Não estão na spec original. Existem porque a Messages API é sem estado: a cada
turno o loop reenvia o histórico completo, incluindo blocos de ferramenta e de
raciocínio. `mensagem.blocos` guarda os blocos **crus**, em JSONB, exatamente
como a API os produziu — reserializá-los num formato próprio quebraria o replay.

`sessao.curador` é sempre uma pessoa (`SONIA` ou `MIRELLA`), nunca `AMBAS`: é uma
pessoa por sessão, e é isso que atribui corretamente cada avaliação.

### `conversa` — a unidade do dataset

| Coluna | O que carrega |
|---|---|
| `pedido_do_usuario` | O que a pessoa queria |
| `perguntas_da_ia` | Array JSON: o que a IA perguntou antes de indicar |
| `recomendacao_da_ia` | O que ela sugeriu, com justificativa |
| `correcao` | O ajuste da curadora, se houve |
| `porque_da_correcao` | **OBRIGATÓRIO quando há correção** |
| `avaliado_por` | `SONIA` \| `MIRELLA` \| `AMBAS` |
| `nota_da_divergencia` | As duas leituras, com atribuição, quando divergiram |
| `consenso` | `ACORDO` \| `DIVERGENCIA` \| `SO_UMA_AVALIOU` |
| `qualidade` | `ABSORVE` \| `DESCARTA` \| `REVISAR` |
| `confianca` | `ALTA` \| `NORMAL` — acréscimo à spec, que fala em confiança alta e normal sem dar um campo |

**Em divergência, `correcao` é nula de propósito.** Divergência não elege
vencedora; as duas leituras vão inteiras para `nota_da_divergencia`, com o nome
de cada curadora. A constraint
`conversa_divergencia_registra_as_duas_leituras` garante isso no banco, e
`conversa_divergencia_e_sempre_revisar` impede que uma divergência seja marcada
como absorvida.

As outras constraints: `conversa_correcao_exige_porque` (correção sem
justificativa não entra) e `conversa_absorve_exige_confianca`.

### `conversa_filme`

Acréscimo à spec. Liga a conversa aos filmes que a IA indicou
(`RECOMENDADO_PELA_IA`) e aos que a curadora colocou no lugar
(`CORRIGIDO_PELA_CURADORA`), com ordem. Sem isso a Fase 2 precisaria reparsear
texto livre para saber de que filmes uma correção falava.

---

## Memória entre visitas

### `perfil`

`usuario_id` é o identificador do espectador — na Fase 1, a persona que a
curadora está testando. `gostos` e `evita` são arrays; `repertorio` e
`momento_de_vida` são texto; `nivel` permite um tratamento mais próximo para
premium.

`perfil_filme_assistido` responde à pergunta "eu já aluguei esse?".
`perfil_jornada` registra por onde a pessoa já foi conduzida.

É este conjunto que alimenta o bloco de contexto da sessão descrito em
[`docs/metodo.md`](metodo.md) — inclusive a lista do que ainda **falta** saber.

---

## Taxonomia do acervo

Enum `CategoriaAcervo`, espelhando a estrutura de pastas da curadoria. Os rótulos
de exibição vivem em [`src/lib/taxonomia.constant.ts`](../src/lib/taxonomia.constant.ts).

História da empresa · Método de treinamento · Curadoria · Clipping · Entrevistas ·
Revistas 2001 · Cursos · Lista OMO · Atendimento e casos reais · Textos da Sonia ·
Premiações · Marketing e eventos

É enum e não texto livre de propósito: acrescentar uma categoria exige migration,
e é assim que a organização do conhecimento não deriva com o tempo.

---

## Migrations

| Migration | O que faz |
|---|---|
| `20260921120000_init` | Todas as tabelas, enums, índices e chaves estrangeiras |
| `20260921120100_porque_obrigatorio` | As CHECK constraints acima |

As CHECK constraints ficam numa migration separada porque o Prisma não modela
`CHECK` — elas não aparecem em `schema.prisma` e não são vistas por
`prisma migrate diff`. Isso tem duas consequências: `pnpm db:migrate:verify`
continua limpo (as constraints não contam como drift), e a existência delas é
responsabilidade de teste, não do diff.
