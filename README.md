# 2001 Curator

An internal curation tool for **2001 Vídeo**. Sonia and Mirella talk to the
Indicador, get film recommendations, and correct them while recording **the
reason** for every correction. Each conversation becomes structured data.

`2001-curator` names the project, the repository and the infrastructure.
**"O Indicador 2001" names the product** — what the curators address and what
it calls itself, per the Method. The two are deliberately separate: renaming a
container should never rename the thing Sonia is talking to.

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
  psql -U curator -d curator_2001 -c 'SELECT count(*) FROM film'
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
    tools/                The five tools the model can call
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

### The five tools

Tool names and parameters are English because they are the API contract; the
descriptions are Portuguese because they are prompt content, read alongside the
Method.

| Tool                 | Role                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| `search_films`       | Vector search in Qdrant by tone, theme and meaning — not by keyword      |
| `film_details`       | A film's factual record plus its curatorial layer                        |
| `search_connections` | The bridges the curators built, with the reason for each                 |
| `search_releases`    | What is in cinemas now, or opening next — TMDB, crossed with the archive |
| `record_feedback`    | Records the correction, passing through the quality gate                 |

`search_releases` is the one tool that does not read the archive, and it is
bound by the two buckets like everything else: its synopses and scores are
third-party lookup, nothing it returns is written anywhere — a listing cached
in the database is a lie with a timestamp on it — and a film on the listing
that the archive already knows comes back with its `film_id`, so the Indicador
can call `film_details` and speak about it in the curators' words rather than
TMDB's.

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

**The interface is the film.** The store is named after _2001: A Space
Odyssey_, so the tool is built from the film's visual language rather than from
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
asked for "docker-compose"; the Compose Spec's canonical naming plus explicit
`-f` invocation avoids the silent auto-loaded override, which is a reliable
source of dev/CI drift. Behaviour is identical.

**The Postgres database is `curator_2001`, not `2001-curator`.** A Postgres
identifier cannot start with a digit or carry a hyphen without being quoted at
every single reference, forever. The one place the project name cannot be spelled
literally is the one place it would hurt most to get wrong.

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

## Deploying

Vercel hosts the Next.js app well. It does **not** host the two databases —
those are separate managed services, and Prisma on serverless needs a specific
connection setup. Four things to settle.

### 1. Close the login first

`APP_CURATION_PASSWORD` is optional in development and **mandatory in
production**: `signIn` refuses a passwordless sign-in when `NODE_ENV` is
`production`. Without that guard, anyone who finds the URL picks a curator's
name and writes to the dataset under it.

Two curators do not justify an identity provider, but they do justify one of:

- a long random `APP_CURATION_PASSWORD` (the built-in path), or
- Vercel Deployment Protection in front of the whole app, or
- keeping the tool off the public internet entirely and running it locally,
  which is a legitimate answer for a tool with two users.

`APP_SESSION_SECRET` must also be a long random value, and a different one per
environment — it signs the cookie that decides who a review is attributed to.

### 2. Postgres

**Neon** is the recommendation, over Supabase: this project needs Postgres and
nothing else, and Supabase's value is the auth, storage and realtime stack
around it. Neon scales to zero, which matters for a tool used a few times a
week. Supabase works fine if you would rather have one vendor.

On serverless, connection exhaustion is the trap: every cold start opens a
connection, and Postgres runs out long before traffic does. `schema.prisma`
therefore declares two URLs, and both must be set:

| Variable              | Which connection | Used by                      |
| --------------------- | ---------------- | ---------------------------- |
| `DATABASE_URL`        | pooled           | the application              |
| `DIRECT_DATABASE_URL` | direct           | migrations and introspection |

Locally there is no pooler, so the two are identical. On Neon or Supabase they
differ, and pointing migrations at the pooler fails on the session-level
statements they issue.

### Two env files, and how to switch

`.env` is local, always. Production credentials live in `.env.prod`, which
nothing reads automatically — `pnpm dev`, the Prisma CLI and every script see
localhost and only localhost. That is deliberate: a production URL in `.env`
makes `pnpm dev` write to production and turns the local database into scenery.

The name is `.env.prod`, not `.env.production`: Next.js loads
`.env.production` on its own whenever NODE_ENV is production, which `next
build` sets, so a local `pnpm build` would silently connect to the production
database. `.env.prod` means nothing to any tool except `pnpm prod`.

To reach production, say so:

```bash
pnpm prod pnpm db:migrate:deploy
pnpm prod pnpm ingest:tmdb -- --title "Rashomon"
pnpm prod pnpm index:embeddings -- --recreate
```

`pnpm prod` is `scripts/with-env.mjs`, which layers `.env.prod` over the
process environment and prints which variables it overrode before running
anything. `--env-file` does not override a variable already set in the
environment, so the production values win over `.env` inside that command and
nowhere else.

The deployed app never reads either file: Vercel injects its own environment.

Migrations run with the direct URL, never from a serverless function. Either
`pnpm prod pnpm db:migrate:deploy` from your machine, or a build step —
`prisma migrate deploy && next build` as the Vercel build command.

### 3. Qdrant

Qdrant Cloud has a free tier that fits this archive. Set `QDRANT_URL` and
`QDRANT_API_KEY`; the client already sends the key when it is present. Then
run `pnpm index:embeddings -- --recreate` **once, pointed at production**, to
build the collection — the ingestion and indexing scripts are CLIs, not part of
the deployment.

`QDRANT_URL` must carry the REST port — the host, then `:6333`. The dashboard
shows the host without it, and `https://` then defaults to 443, where nothing is
listening. The only symptom is `fetch failed`, which is indistinguishable from a
stopped container.

`QDRANT_COLLECTION` must be the same string in every environment that expects
the same index. `film.indexed_at` in Postgres records _that_ a film was indexed,
never into which cluster or collection, so a name that drifts between
environments presents as an empty archive rather than as a misconfiguration.

Keep the server minor in step with `@qdrant/js-client-rest`.

`pnpm check:services` reports on all of this — Postgres, Qdrant, the embeddings
provider, then the exact path `search_films` takes — and `pnpm prod pnpm
check:services` does it against production. It writes nothing.

### The environment Vercel needs

| Variable                | Value                                         |
| ----------------------- | --------------------------------------------- |
| `DATABASE_URL`          | Neon **pooled** (hostname carries `-pooler`)  |
| `DIRECT_DATABASE_URL`   | Neon **direct** (same host, no `-pooler`)     |
| `QDRANT_URL`            | the cluster URL **with `:6333`**              |
| `QDRANT_API_KEY`        | the cluster key                               |
| `QDRANT_COLLECTION`     | `films` — the same string everywhere          |
| `ANTHROPIC_API_KEY`     | —                                             |
| `ANTHROPIC_MODEL`       | `claude-opus-5`                               |
| `EMBEDDINGS_PROVIDER`   | `voyage` — see the warning below              |
| `VOYAGE_API_KEY`        | —                                             |
| `VOYAGE_MODEL`          | `voyage-3`                                    |
| `APP_SESSION_SECRET`    | a long random value, **different from local** |
| `APP_CURATION_PASSWORD` | required in production                        |

`TMDB_ACCESS_TOKEN` and the `OPENAI_*` pair are **not** needed: the deployed app
never calls TMDB — only the ingestion CLI does — and OpenAI is the unused
alternative embeddings provider.

> **`EMBEDDINGS_PROVIDER=local` in production is the worst failure in this
> project**, because it does not fail. The local fallback produces 1024-dimension
> vectors and so does `voyage-3`, so Qdrant accepts the query, returns neighbours
> from a completely unrelated vector space, and the Indicador recommends
> confidently from nonsense. Nothing errors and nothing logs. Set it to `voyage`
> and keep it there.

### The conversation is a long request

A turn can make up to eight tool round-trips before it answers, each one a full
model call. That runs well past the default serverless timeout. Set
`maxDuration` on `app/api/chat/route.ts` to the ceiling your plan allows and
confirm the platform streams SSE without buffering; the route already sends
`x-accel-buffering: no` for proxies that do.

If the turn cannot fit in the platform's limit, the conversation loop belongs
on a long-lived host (a container on Fly, Railway, or a VM) rather than on
serverless functions. That is an architecture decision, not a configuration
one — worth settling before the first real curation session, not after.

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
