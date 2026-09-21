# Indicador 2001

Ferramenta interna de curadoria da **2001 Vídeo**. Sonia e Mirella conversam com
o Indicador, recebem recomendações de filmes e as corrigem registrando **o porquê**
de cada correção. Cada conversa vira dado estruturado.

O valor deste projeto não é o chat. É o **dataset curatorial** que o chat coleta —
o material que, na Fase 2 (fora deste repositório), treinará um modelo próprio.
Toda decisão de arquitetura aqui existe para proteger a qualidade e a integridade
desse dado.

---

## Os dois baldes

O princípio que mais restringe o desenho deste repositório.

| Balde | O que é | Pode treinar? | Onde vive |
|---|---|---|---|
| **Conteúdo próprio da 2001** | Tom emocional, o que o filme provoca, notas de curadoria, contexto histórico, as conexões entre filmes e o porquê de cada uma, as correções das curadoras | **Sim** | Colunas curatoriais de `filme`, tabelas `conexao`, `jornada`, `lista_editorial`, `conversa` |
| **Conteúdo de terceiros** | Ficha técnica e sinopse vindas do TMDB | **Não — consulta em tempo real apenas** | Colunas factuais de `filme`, marcadas com `fonte_factual` |

Como a separação é sustentada, e não apenas declarada:

1. **Rastreabilidade por linha.** `filme.fonte_factual` diz de onde veio a ficha
   (`TMDB` ou `FIXTURE_DEV`). `filme.fonte_curatorial` diz de quem é o estudo
   (`CURADORIA_2001` ou `DEMO`).
2. **A ingestão nunca sobrescreve curadoria.** `salvarCamadaFactual` grava só as
   colunas factuais; rodar `pnpm ingerir:tmdb` mil vezes não toca no estudo das
   curadoras. (`src/server/acervo.service.ts`)
3. **O exportador só lê o balde próprio.** Nenhuma sinopse, pôster ou prosa do
   TMDB entra no JSONL — por construção, não por filtro. Título e ano entram
   apenas como identificação, e cada linha declara isso em `procedencia`.
   (`src/server/exportador.service.ts`)
4. **Demonstração não se disfarça de curadoria.** O seed de demonstração grava
   `fonte_curatorial = DEMO` e `curador = DEMO`; uma CHECK constraint no banco
   impede que esse dado apareça como avaliado por Sonia ou Mirella, e o
   exportador o descarta.

O índice do Qdrant é a única coisa que mistura os dois baldes — e de propósito:
ele é estrutura de consulta, nunca é exportado, e é descartável (`--recriar`).

---

## O porquê é sempre capturado

Correção sem justificativa é dado quase inútil. A regra é aplicada em três camadas
independentes, porque uma só sempre acaba contornada:

- **Interface** — o campo "por quê" é obrigatório assim que a curadora marca que
  há correção. (`src/components/painel-de-correcao.component.tsx`)
- **Portão de qualidade** — recusa justificativa ausente, curta demais ou de
  reflexo ("não gostei"), e **nada é gravado**: devolve uma pergunta para a
  curadora responder. (`src/server/tools/portao-de-qualidade.util.ts`)
- **Banco** — CHECK constraints garantem a regra mesmo para quem chamar a API
  direto. (`prisma/migrations/20260921120100_porque_obrigatorio/`)

### O portão de qualidade

| Situação | Resultado |
|---|---|
| Sonia e Mirella chegam à mesma leitura | `ABSORVE`, confiança `ALTA` |
| Só uma avaliou | `ABSORVE`, confiança `NORMAL` |
| As duas divergem | `REVISAR` — as duas leituras registradas em `nota_da_divergencia`, **sem eleger vencedora** (`correcao` fica nula, e o banco confirma) |
| Feedback pobre ou ambíguo | Nada é gravado; o portão devolve a pergunta. Se a curadora não quiser detalhar, fica registrado como `DESCARTA` |

Quando as duas corrigem, o portão **não tenta adivinhar** se concordam comparando
texto livre — ele pergunta. Inferir errado silenciaria uma divergência ou
inventaria uma, e a pluralidade de olhares entre as duas é um ativo do dataset.

---

## Pré-requisitos

- **Node.js 24+** (o projeto é validado em 26)
- **pnpm 10.33.4** — `corepack enable && corepack install`
- **Docker** com o plugin Compose

Chaves de API são **opcionais para subir o projeto** e necessárias para usá-lo
por inteiro; veja `.env.example`.

## Como rodar do zero

```bash
cp .env.example .env
```

Abra o `.env` e troque pelo menos `APP_SESSION_SECRET` por uma string longa e
aleatória. Depois:

```bash
pnpm install
```

Suba Postgres e Qdrant (a invocação sempre lista os dois arquivos, nesta ordem):

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d
```

Gere o cliente Prisma e aplique as migrations:

```bash
pnpm db:generate \
  && pnpm db:migrate:deploy
```

Popule o acervo. Sem `TMDB_ACCESS_TOKEN` no `.env`, isto usa o fixture local de
14 filmes (`data/filmes-fixture.json`):

```bash
pnpm ingerir:tmdb \
  && pnpm db:seed \
  && pnpm indexar:embeddings
```

Suba a aplicação:

```bash
pnpm dev
```

Abra <http://localhost:3000>, entre como Sonia ou Mirella, e comece uma conversa.

> **Sem `ANTHROPIC_API_KEY` o chat não funciona** — todo o resto (ingestão,
> indexação, páginas, exportação) funciona. A mensagem de erro diz exatamente isso.

### Com as chaves de verdade

No `.env`:

```bash
ANTHROPIC_API_KEY=...
TMDB_ACCESS_TOKEN=...          # token de leitura v4 do TMDB
EMBEDDINGS_PROVIDER=voyage
VOYAGE_API_KEY=...
```

Depois traga fichas reais e refaça o índice — trocar de provider de embeddings
exige reindexar, porque vetores de providers diferentes não se comparam:

```bash
pnpm ingerir:tmdb -- --titulo "Rashomon" --titulo "Os Sete Samurais" \
  && pnpm indexar:embeddings -- --recriar
```

---

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Sobe a aplicação em desenvolvimento |
| `pnpm build` / `pnpm start` | Build e execução de produção |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm test` | Vitest |
| `pnpm db:generate` | Gera o cliente Prisma |
| `pnpm db:migrate` | Cria e aplica migration a partir do `schema.prisma` (dev) |
| `pnpm db:migrate:deploy` | Aplica as migrations versionadas (setup e produção) |
| `pnpm db:migrate:verify` | Prova que as migrations produzem exatamente o `schema.prisma` |
| `pnpm db:seed` | Camada curatorial de **demonstração** (`-- --limpar` remove) |
| `pnpm ingerir:tmdb` | Ingere a camada factual (`-- --id`, `-- --titulo`, `-- --fixture`) |
| `pnpm indexar:embeddings` | Gera e indexa os vetores (`-- --tudo`, `-- --recriar`) |
| `pnpm exportar:dataset` | Exporta o JSONL (`-- --saida exports/2026-09.jsonl`) |

Para rodar um comando dentro de um contêiner já de pé, use `docker compose exec`:

```bash
docker compose -f compose.yaml -f compose.dev.yaml exec -T postgres \
  psql -U indicador -d indicador_2001 -c 'SELECT count(*) FROM filme'
```

---

## Arquitetura

```text
app/                      Rotas do App Router (thin: só rota, auth e composição)
  api/auth|sessao|chat|feedback|exportar/route.ts
  chat/[sessaoId]/        Página da conversa
  conversas/              O dataset, como tabela
src/
  method/system-prompt.constant.ts   O Método 2001 — texto, feito para as curadoras editarem
  components/             Interface (client components)
  lib/                    Tipos e utilitários compartilhados servidor/navegador
  server/                 Tudo que só roda no servidor (marcado com `server-only`)
    acervo.service.ts     Ingestão factual sem tocar na curadoria
    indexacao.service.ts  Texto → vetor → Qdrant
    exportador.service.ts JSONL da Fase 2
    embeddings/           Provider plugável: voyage | openai | local
    tools/                As quatro tools + o portão de qualidade
    indicador/            O loop de conversa com tool calling
prisma/                   schema.prisma + migrations versionadas
scripts/                  CLIs de ingestão, indexação, seed e exportação
data/                     Fixture factual e curadoria de demonstração
```

### O fluxo

1. A curadora abre uma sessão, opcionalmente ligada a uma persona de espectador.
2. O Indicador recebe o Método como system prompt e, **depois do ponto de cache**,
   um bloco com o que se sabe daquela pessoa — e uma lista explícita do que ainda
   **não** se sabe, como perguntas em aberto. É assim que "perguntar antes de
   recomendar" deixa de depender da boa vontade do modelo.
3. Ele chama `buscar_filmes` / `detalhes_do_filme` / `buscar_conexoes` para
   fundamentar, e responde com no máximo três opções, cada uma justificada.
4. A curadora avalia. A interface exige o porquê.
5. `registrar_feedback` grava, passando pelo portão de qualidade.
6. `pnpm exportar:dataset` (ou `/api/exportar`) produz o JSONL.

### As quatro tools

| Tool | Papel |
|---|---|
| `buscar_filmes` | Busca vetorial no Qdrant por tom/tema/significado — não por palavra-chave |
| `detalhes_do_filme` | Ficha factual + camada curatorial de um filme |
| `buscar_conexoes` | As pontes que as curadoras estabeleceram, com o porquê de cada uma |
| `registrar_feedback` | Grava a correção, passando pelo portão de qualidade |

---

## Decisões de projeto

**Prisma, não Drizzle.** O valor deste repositório está na integridade do dado, e
o que mais importa é a camada de migrations: as `migrate diff` / `migrate deploy`
do Prisma permitem provar mecanicamente que o SQL versionado produz exatamente o
schema declarado (`pnpm db:migrate:verify`). O Prisma também gera enums nativos do
Postgres a partir do schema, o que mantém os vocabulários do Método (`Curador`,
`Qualidade`, `CategoriaAcervo`) como restrição do banco e não como convenção.
Fixado na linha **6.x**: a 7 mudou o formato de configuração e não havia como
validar essa mudança neste ambiente.

**Voyage AI como padrão de embeddings.** A Anthropic não expõe endpoint de
embeddings; a Voyage é o provider que ela recomenda. A interface é plugável
(`src/server/embeddings/`): trocar para OpenAI é mudar `EMBEDDINGS_PROVIDER`.
Existe também um provider `local`, determinístico e sem rede, para que o projeto
rode sem nenhuma chave — ele aproxima **sobreposição de palavras, não
significado**, que é o oposto do que o Método pede. Serve para demonstração;
nunca para indexar o acervo real.

**`claude-opus-5` com fallback.** O modelo é configurável por
`ANTHROPIC_MODEL`. O pedido declara um fallback de servidor para o caso de recusa
por política — improvável num produto de cinema, mas uma conversa que morre no
meio sem explicação é pior que uma atendida pelo modelo anterior.

**`compose.yaml` / `compose.dev.yaml`, não `docker-compose.yml`.** A spec pedia
"docker-compose"; o padrão da EPCVIP exige a nomenclatura canônica da Compose Spec
e invocação explícita com `-f`. O comportamento é o mesmo.

**O pacote se chama `@epcvip/indicador-2001`.** É o escopo que o padrão de
manifesto da organização exige. O pacote é privado e nunca publicado; se este
projeto sair do guarda-chuva da EPCVIP, troque o escopo.

**`ConversaFilme` não está na spec.** Liga cada conversa aos filmes que a IA
indicou e aos que a curadora colocou no lugar. Sem isso, a Fase 2 teria que
reparsear texto livre para saber de que filmes uma correção falava. A interface
manual não preenche esses ids (a curadora teria que digitar UUIDs); o caminho em
que o próprio Indicador chama `registrar_feedback` preenche, porque ele tem os ids.

**`Sessao` e `Mensagem` não estão na spec.** A Messages API é sem estado e o loop
precisa devolver o histórico íntegro — inclusive blocos de ferramenta — a cada
turno. `Conversa` continua sendo a unidade exportável; estas duas guardam o
transcript que a sustenta.

---

## Documentação

- [`docs/metodo.md`](docs/metodo.md) — o Método 2001 e como editá-lo
- [`docs/schema.md`](docs/schema.md) — o modelo de dados, entidade por entidade

---

## Fora de escopo (Fase 1)

Deliberadamente **não** construído aqui: fine-tuning ou qualquer treino de modelo
(Fase 2, fora deste repo, em Python + GPU); API pública para terceiros (Fase 3);
interface rica de usuário final; autenticação robusta ou multiusuário em escala;
otimização de custo de token.

---

## Estado de verificação

Este repositório foi escrito num ambiente onde instalação de pacotes e Docker são
somente-leitura. Em consequência, **nada foi executado**: não rodaram `pnpm install`,
`tsc --noEmit`, `eslint`, `prisma migrate`, os testes, nem a aplicação.

O que **foi** verificado mecanicamente: a forma do `package.json` (validador de
manifesto), os dois arquivos Compose (yamllint no domínio `compose`), e o lockfile
(`pnpm install --lockfile-only` resolveu as 428 dependências sem conflito de peer).

Primeira coisa a rodar na sua máquina, nesta ordem — espere ajustes de tipo no
primeiro `typecheck`:

```bash
pnpm install \
  && pnpm db:generate \
  && pnpm typecheck \
  && pnpm lint \
  && pnpm test
```

Depois, com o banco de pé, confirme que as migrations versionadas batem com o
schema (exige `SHADOW_DATABASE_URL` no `.env` e o banco sombra criado):

```bash
pnpm db:migrate:verify
```
