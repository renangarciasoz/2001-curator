# Indicador 2001

An internal curation tool for **2001 Vídeo**. Sonia and Mirella talk to the
Indicador, get film recommendations, and correct them while recording **the
reason** for every correction. Each conversation becomes structured data.

The value of this project is not the chat. It is the **curatorial dataset** the
chat collects — the material that, in Phase 2 (outside this repository), will
train a model of the archive's own. Every architectural decision here exists to
protect the quality and integrity of that data.

> **Language split.** Code, schema, and documentation are English. The product
> surface is Brazilian Portuguese: everything the curators read, and the Method
> system prompt itself. The Indicador converses in Portuguese because that is
> the language of the archive and of its viewers.

---

## The two buckets

The principle that constrains the design of this repository the most.

| Bucket                             | What it is                                                                                                                                                     | Trainable?                | Where it lives                                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **The 2001 archive's own content** | Emotional tone, what the film provokes, curatorial notes, historical context, the connections between films and the reason for each, the curators' corrections | **Yes**                   | The curatorial columns of `film`, plus the `connection`, `journey`, `editorial_list` and `conversation` tables |
| **Third-party content**            | Technical record and synopsis from TMDB                                                                                                                        | **No — live lookup only** | The factual columns of `film`, tagged with `factual_source`                                                    |

How the separation is sustained rather than merely declared:

1. **Per-row traceability.** `film.factual_source` says where the record came
   from (`TMDB` or `DEV_FIXTURE`). `film.curatorial_source` says whose study it
   is (`CURATION_2001` or `DEMO`).
2. **Ingestion never overwrites curation.** `saveFactualLayer` writes only the
   factual columns; running `pnpm ingest:tmdb` a thousand times does not touch
   the curators' study. (`src/server/archive.service.ts`)
3. **The exporter only reads the archive's own bucket.** No TMDB synopsis,
   poster or prose enters the JSONL — by construction, not by filtering. Title
   and year go in only as identification, and every line declares that in
   `provenance`. (`src/server/exporter.service.ts`)
4. **Demonstration data does not pose as curation.** The demo seed writes
   `curatorial_source = DEMO` and `curator = DEMO`; a CHECK constraint stops
   that data from ever appearing as reviewed by Sonia or Mirella, and the
   exporter drops it.

The Qdrant index is the only thing that mixes the two buckets — deliberately:
it is lookup structure, it is never exported, and it is disposable
(`--recreate`).

---

## The why is always captured

A correction without a reason is nearly useless data. The rule is enforced in
three independent layers, because one layer always ends up bypassed:

- **Interface** — the "why" field becomes required the moment a curator marks
  that there is a correction.
  (`src/components/correction-panel.component.tsx`)
- **Quality gate** — refuses a missing, too-short, or reflex reason ("não
  gostei"), and **nothing is written**: it returns a question for the curator to
  answer. (`src/lib/quality-gate.util.ts`)
- **Database** — CHECK constraints hold the rule even for someone calling the
  API directly. (`prisma/migrations/20260921120100_why_is_mandatory/`)

### The quality gate

| Situation                                | Outcome                                                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Sonia and Mirella reach the same reading | `ABSORB`, `HIGH` confidence                                                                                                              |
| Only one reviewed                        | `ABSORB`, `NORMAL` confidence                                                                                                            |
| The two disagree                         | `REVIEW` — both readings recorded in `disagreement_note`, **electing no winner** (`correction` stays null, and the database confirms it) |
| Thin or ambiguous feedback               | Nothing is written; the gate returns the question. If the curator will not elaborate, it is recorded as `DISCARD`                        |

When both correct, the gate **does not try to guess** whether they agree by
comparing free text — it asks. Guessing wrong would either silence a real
disagreement or invent one, and the plurality of readings between the two is an
asset of the dataset.

---

## Prerequisites

- **Node.js 24+** (validated against 26)
- **pnpm 10.33.4** — `corepack enable && corepack install`
- **Docker** with the Compose plugin

API keys are **optional to bring the project up** and required to use it fully;
see `.env.example`.

## Running it from scratch

```bash
cp .env.example .env
```

Open `.env` and replace at least `APP_SESSION_SECRET` with a long random string.
Then:

```bash
pnpm install
```

Bring up Postgres and Qdrant (the invocation always lists both files, in order):

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d
```

Generate the Prisma client and apply the migrations:

```bash
pnpm db:generate \
  && pnpm db:migrate:deploy
```

Populate the archive. Without `TMDB_ACCESS_TOKEN` in `.env`, this uses the local
14-film fixture (`data/films-fixture.json`):

```bash
pnpm ingest:tmdb \
  && pnpm db:seed \
  && pnpm index:embeddings
```

Start the app:

```bash
pnpm dev
```

Open <http://localhost:3000>, sign in as Sonia or Mirella, and start a
conversation.

> **Without `ANTHROPIC_API_KEY` the chat does not work** — everything else
> (ingestion, indexing, pages, export) does. The error message says exactly that.

### With the real keys

In `.env`:

```bash
ANTHROPIC_API_KEY=...
TMDB_ACCESS_TOKEN=...          # TMDB v4 read access token
EMBEDDINGS_PROVIDER=voyage
VOYAGE_API_KEY=...
```

Then fetch real records and rebuild the index — switching embeddings provider
requires re-indexing, because vectors from different providers do not compare:

```bash
pnpm ingest:tmdb -- --title "Rashomon" --title "Os Sete Samurais" \
  && pnpm index:embeddings -- --recreate
```

---

## Commands

| Command                     | What it does                                                        |
| --------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                  | Runs the app in development                                         |
| `pnpm build` / `pnpm start` | Production build and run                                            |
| `pnpm typecheck`            | `tsc --noEmit`                                                      |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                                   |
| `pnpm test`                 | Vitest                                                              |
| `pnpm db:generate`          | Generates the Prisma client                                         |
| `pnpm db:migrate`           | Creates and applies a migration from `schema.prisma` (dev)          |
| `pnpm db:migrate:deploy`    | Applies the versioned migrations (setup and production)             |
| `pnpm db:migrate:verify`    | Proves the migrations produce exactly `schema.prisma`               |
| `pnpm db:seed`              | **Demonstration** curatorial layer (`-- --clear` removes it)        |
| `pnpm ingest:tmdb`          | Ingests the factual layer (`-- --id`, `-- --title`, `-- --fixture`) |
| `pnpm index:embeddings`     | Generates and indexes the vectors (`-- --all`, `-- --recreate`)     |
| `pnpm export:dataset`       | Exports the JSONL (`-- --out exports/2026-09.jsonl`)                |

To run a command inside an already-running container, use `docker compose exec`:

```bash
docker compose -f compose.yaml -f compose.dev.yaml exec -T postgres \
  psql -U indicador -d indicador_2001 -c 'SELECT count(*) FROM film'
```

---

## Architecture

```text
app/                      App Router routes (thin: route concerns, auth, composition)
  api/auth|session|chat|feedback|export/route.ts
  chat/[sessionId]/       The conversation page
  conversations/          The dataset, as a reading list
  globals.css             The Tailwind theme — palette, type scale, shared controls
src/
  method/system-prompt.constant.ts   The 2001 Method — Portuguese prose, for the curators to edit
  components/             Interface (client components)
    page-shell.component.tsx   Masthead and reading column, shared by every page
  lib/                    Types and pure logic shared by server and browser
    quality-gate.util.ts  The feedback rules — no I/O, so both sides use them
  server/                 Everything server-only (marked with `server-only`)
    archive.service.ts    Factual ingestion that never touches curation
    indexing.service.ts   Text → vector → Qdrant
    exporter.service.ts   The Phase 2 JSONL
    embeddings/           Pluggable provider: voyage | openai | local
    tools/                The four tools the model can call
    indicator/            The tool-calling conversation loop
prisma/                   schema.prisma + versioned migrations
scripts/                  Ingestion, indexing, seeding and export CLIs
data/                     Factual fixture and demonstration curation
```

### The flow

1. A curator opens a session, optionally tied to a viewer persona.
2. The Indicador receives the Method as its system prompt and, **after the cache
   breakpoint**, a block with what is known about that person — plus an explicit
   list of what is **not** yet known, as open questions. That is how "ask before
   recommending" stops depending on the model's good will.
3. It calls `search_films` / `film_details` / `search_connections` to ground
   itself, and answers with at most three options, each one justified.
4. The curator reviews. The interface demands the why.
5. `record_feedback` writes it, passing through the quality gate.
6. `pnpm export:dataset` (or `/api/export`) produces the JSONL.

### The four tools

Tool names and parameters are English because they are the API contract; the
descriptions are Portuguese because they are prompt content, read alongside the
Method.

| Tool                 | Role                                                                |
| -------------------- | ------------------------------------------------------------------- |
| `search_films`       | Vector search in Qdrant by tone, theme and meaning — not by keyword |
| `film_details`       | A film's factual record plus its curatorial layer                   |
| `search_connections` | The bridges the curators built, with the reason for each            |
| `record_feedback`    | Records the correction, passing through the quality gate            |

---

## Design decisions

**Prisma, not Drizzle.** The value of this repository is data integrity, and the
migrations layer is what matters most: Prisma's `migrate diff` / `migrate
deploy` let you prove mechanically that the versioned SQL produces exactly the
declared schema (`pnpm db:migrate:verify`). Prisma also generates native
Postgres enums from the schema, which keeps the Method's vocabularies
(`Curator`, `Quality`, `ArchiveCategory`) as database constraints rather than
conventions. Pinned to the **6.x** line: 7 changed the configuration format and
there was no way to validate that change in this environment.

**Voyage AI as the embeddings default.** Anthropic exposes no embeddings
endpoint; Voyage is the provider it recommends. The interface is pluggable
(`src/server/embeddings/`): switching to OpenAI is one environment variable.
There is also a `local` provider, deterministic and offline, so the project runs
with no key at all — it approximates **word overlap, not meaning**, which is the
opposite of what the Method asks for. Good for a demo; never for indexing the
real archive.

**`claude-opus-5` with a fallback.** The model is configurable via
`ANTHROPIC_MODEL`. The request declares a server-side fallback in case of a
policy refusal — unlikely in a film product, but a conversation that dies
mid-turn with no explanation is worse than one served by the previous model.

**The interface is the film.** The store is named after *2001: A Space
Odyssey*, so the tool is built from the film's visual language rather than from
a generic dark theme. Tailwind v4, theme in `app/globals.css` rather than a JS
config:

- **The monolith** — absolute black, exact rectangles, nothing rounded. It is
  the logo mark, at the 1:4 of the slab's 1:4:9.
- **The Discovery interiors** — cool white on near-black, flat even light, thin
  seams between panels instead of cards and drop shadows.
- **HAL's lens** — one red (`--color-hal`), used as a point of light and almost
  never as a fill. It marks what needs attention: a disagreement, a failure,
  the Indicador reaching into the archive.
- **The instrument readouts** — amber, and small monospaced caps with wide
  tracking, the way a panel legend is set.

Typography follows the film's own: **Jost** is a Futura revival, and Futura is
what the title cards and the poster are set in. **Inter** carries body text,
because a geometric face at reading size for hours is punishing. **IBM Plex
Mono** is the instrument voice — labels, metadata, identifiers, never prose.

Restraint is the point: 2001 is mostly greyscale with tiny points of red and
amber, and a screen full of glow would read as pastiche. Two people read and
write long prose here all day, so the measure is capped near 70 characters and
legibility wins wherever it conflicts with atmosphere. The dataset page is the
one view that gets a wider column, because it is scanned rather than read.

**`compose.yaml` / `compose.dev.yaml`, not `docker-compose.yml`.** The spec
asked for "docker-compose"; the EPCVIP standard requires the Compose Spec's
canonical naming and explicit `-f` invocation. Behaviour is identical.

**The package is named `@epcvip/indicador-2001`.** That is the scope the
organisation's manifest standard requires. The package is private and never
published; if this project leaves the EPCVIP umbrella, change the scope.

**`ConversationFilm` is not in the spec.** It links each conversation to the
films the AI recommended and the ones the curator put in their place. Without
it, Phase 2 would have to re-parse free text to know which films a correction
was about. The manual interface does not fill those ids in (the curator would
have to type UUIDs); the path where the Indicador itself calls `record_feedback`
does, because it has them.

**`Session` and `Message` are not in the spec.** The Messages API is stateless
and the loop has to hand back the full history — tool blocks included — on every
turn. `Conversation` remains the exportable unit; these two hold the transcript
behind it.

---

## Documentation

- [`docs/method.md`](docs/method.md) — the 2001 Method and how to edit it
- [`docs/schema.md`](docs/schema.md) — the data model, entity by entity

---

## Known limitations

- **Two doors into `record_feedback`.** A curator can review through the
  correction panel **or** by asking the Indicador to record it. Both paths
  create separate rows in `conversation`; there is no deduplication. Review each
  recommendation through one path, or the dataset gains twin records.
- **The panel does not fill `conversation_film`.** Linking the conversation to
  films would mean typing UUIDs by hand. Only the path where the Indicador calls
  the tool fills that link, because it has the ids.
- **The `local` embeddings provider is not real semantic search.** It
  approximates word overlap. It is demo scaffolding; configure Voyage before
  indexing a real archive.
- **No pagination on `/conversations`.** The page shows the 100 most recent.

## Out of scope (Phase 1)

Deliberately **not** built here: fine-tuning or any model training (Phase 2,
outside this repo, in Python + GPU); a public API for third parties (Phase 3); a
rich end-user interface; robust or multi-tenant authentication; token cost
optimisation.

---

## Verification status

Green so far: `pnpm install`, `pnpm db:generate`, `pnpm typecheck`,
`pnpm format`, `pnpm lint`. The `package.json` shape and both Compose files also
pass their respective validators.

Both migrations have been applied to a real PostgreSQL 18 and the eleven CHECK
constraints exercised against it — sixteen assertions covering curation
traceability, the mandatory why on a bridge, and every branch of the feedback
gate. Demonstration data signed by a curator is refused; a correction without a
reason is refused; a disagreement that elects a winner, skips review, or drops
one of the two readings is refused; the legitimate shapes are accepted.

**Never executed yet** — treat as unproven until you run it:

- `pnpm test` — the suite was fixed after failing on a config bug; re-run it.
- `pnpm db:migrate:verify`. The constraint work above proves the SQL runs and
  behaves; it does not prove the migrations reproduce `schema.prisma` exactly.
- Every network path: TMDB ingestion, Voyage or OpenAI embeddings, Qdrant
  indexing and search, and the Anthropic conversation loop.
- The interface beyond a first render — no conversation has completed a turn.

The full check, in order:

```bash
pnpm install \
  && pnpm db:generate \
  && pnpm typecheck \
  && pnpm lint \
  && pnpm test
```

Then, with the database up, confirm the versioned migrations match the schema
(requires `SHADOW_DATABASE_URL` in `.env` and the shadow database created):

```bash
pnpm db:migrate:verify
```
