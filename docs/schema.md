# The data model

Source of truth: [`prisma/schema.prisma`](../prisma/schema.prisma). This
document explains the intent behind each entity — what the schema cannot say on
its own.

Conventions that hold across every table: `snake_case` columns, attributes in
the order PK → FKs → secondary identifiers → domain → derived → statuses →
flags → timestamps, and every timestamp as `TIMESTAMPTZ(6)`.

---

## Archive

### `film`

One row per film, with **two blocks of columns that do not mix**.

**Factual layer** (third-party bucket — lookup, never training):
`title`, `original_title`, `year`, `director`, `country`, `factual_synopsis`,
`poster_path`, and `factual_source` (`TMDB` | `DEV_FIXTURE`).

**2001 curatorial layer** (the differentiator — trainable material):

| Column                | What it carries                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `emotional_tone`      | `conforta`, `desafia`, `destrói`, … — free text on purpose: the vocabulary belongs to the curators, not to the schema |
| `what_it_provokes`    | What the film does to the viewer                                                                                      |
| `commercial_register` | `COMMERCIAL` \| `ARTHOUSE` \| `BOTH` — description, not judgement. Every film is a film                               |
| `curatorial_notes`    | The months-long study. Free text                                                                                      |
| `historical_context`  | Why it matters in the history of cinema                                                                               |
| `archive_category`    | Taxonomy label (below)                                                                                                |
| `reviewed_by`         | List: `SONIA`, `MIRELLA`, `BOTH`                                                                                      |
| `curatorial_source`   | `CURATION_2001` \| `DEMO`                                                                                             |

`indexed_at` is vector-index bookkeeping: null means "the Qdrant vector is
stale". Ingestion and the seed null this field whenever they change any text
that feeds the embedding.

**Constraints worth knowing:**

- `film_real_curation_declares_reviewer` — if `curatorial_source =
CURATION_2001`, `reviewed_by` cannot be empty and cannot contain `DEMO`.
- `film_demo_does_not_pose_as_curation` — if `curatorial_source = DEMO`,
  `reviewed_by` cannot contain `SONIA`, `MIRELLA` or `BOTH`.

### `connection` — the heart of the Method

A directed bridge between two films.

| Column                             | What it carries                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `source_film_id`, `target_film_id` | From where to where                                                                                   |
| `type`                             | `ENTRY_POINT`, `IF_YOU_LIKED`, `BEFORE_WATCHING`, `RELEASE_TO_ARCHIVE`, `ARCHIVE_TO_RELEASE`, `OTHER` |
| `bridged_by`                       | `gênero`, `elenco`, `direção`, `tema`, … — free text                                                  |
| `why`                              | **REQUIRED.** The reason for the bridge, in the curator's words                                       |
| `curator`                          | Who established it                                                                                    |

`connection_why_not_empty` rejects an empty or whitespace-only string — `NOT
NULL` alone would let `''` through. `connection_source_differs_from_target`
blocks the degenerate bridge.

Uniqueness on `(source, target, type)`: the same two films may have more than
one bridge, as long as the types differ.

### `journey` / `journey_film`

A timeless formative track — "Começando Kurosawa". `objective` describes **which
viewer it forms**, not what it contains. Each item has a `position` (unique
within the journey) and a `why_note`: why this film, **in this position**.

### `editorial_list` / `editorial_list_film`

A recurring, dated list, heir to the Lista OMO. `period` is a month or season
(`2026-03`, `Mostra de SP 2026`); `type` is `MONTHLY_TOP`, `THEMATIC`, `EVENT`
or `HISTORIC_OMO`. Each entry carries a `curation_line`.

The difference from `journey`: a journey is timeless and forms; a list is dated
and publishes.

---

## Conversation and feedback

### `session` and `message`

Not in the original spec. They exist because the Messages API is stateless: on
every turn the loop resends the full history, including tool and reasoning
blocks. `message.blocks` stores those blocks **raw**, in JSONB, exactly as the
API produced them — re-serializing them into a shape of our own would break
replay.

`session.curator` is always a person (`SONIA` or `MIRELLA`), never `BOTH`: one
person per session, and that is what attributes each review correctly.

### `conversation` — the unit of the dataset

| Column              | What it carries                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `user_request`      | What the person wanted                                                                                               |
| `ai_questions`      | JSON array: what the AI asked before recommending                                                                    |
| `ai_recommendation` | What it suggested, with its reasoning                                                                                |
| `correction`        | The curator's adjustment, if any                                                                                     |
| `correction_reason` | **REQUIRED when there is a correction**                                                                              |
| `reviewed_by`       | `SONIA` \| `MIRELLA` \| `BOTH`                                                                                       |
| `disagreement_note` | Both readings, with attribution, when they disagreed                                                                 |
| `consensus`         | `AGREEMENT` \| `DISAGREEMENT` \| `ONLY_ONE_REVIEWED`                                                                 |
| `quality`           | `ABSORB` \| `DISCARD` \| `REVIEW`                                                                                    |
| `confidence`        | `HIGH` \| `NORMAL` — an addition to the spec, which speaks of high and normal confidence without giving them a field |

**On disagreement, `correction` is null on purpose.** A disagreement elects no
winner; both readings go whole into `disagreement_note`, with each curator's
name. The `conversation_disagreement_records_both_readings` constraint enforces
that in the database, and
`conversation_disagreement_is_always_review` prevents a disagreement from being
marked as absorbed.

The other constraints: `conversation_correction_requires_reason` (a correction
without a reason does not enter) and
`conversation_absorb_requires_confidence`.

### `conversation_film`

An addition to the spec. Links the conversation to the films the AI recommended
(`RECOMMENDED_BY_AI`) and the ones the curator put in their place
(`CORRECTED_BY_CURATOR`), with an order. Without it, Phase 2 would have to
re-parse free text to know which films a correction was about.

---

## Memory between visits

### `profile`

`user_id` is the viewer's identifier — in Phase 1, the persona a curator is
testing. `likes` and `avoids` are arrays; `repertoire` and `life_moment` are
text; `tier` allows closer treatment for premium customers.

`profile_watched_film` answers "have I already rented this one?".
`profile_journey` records where the person has already been led.

This set is what feeds the session context block described in
[`docs/method.md`](method.md) — including the list of what is still **missing**.

---

## Archive taxonomy

The `ArchiveCategory` enum, mirroring the curators' folder structure. Display
labels live in [`src/lib/taxonomy.constant.ts`](../src/lib/taxonomy.constant.ts)
and stay in Portuguese, because the curators read them.

`COMPANY_HISTORY` · `TRAINING_METHOD` · `CURATION` · `CLIPPING` · `INTERVIEWS` ·
`MAGAZINES_2001` · `COURSES` · `OMO_LIST` · `SERVICE_AND_REAL_CASES` ·
`SONIA_TEXTS` · `AWARDS` · `MARKETING_AND_EVENTS`

It is an enum and not free text on purpose: adding a category requires a
migration, and that is how the organisation of the knowledge avoids drifting.

---

## Migrations

| Migration                         | What it does                             |
| --------------------------------- | ---------------------------------------- |
| `20260921120000_init`             | Every table, enum, index and foreign key |
| `20260921120100_why_is_mandatory` | The CHECK constraints above              |

The CHECK constraints live in a separate migration because Prisma does not model
`CHECK` — they do not appear in `schema.prisma` and are invisible to
`prisma migrate diff`. That has two consequences: `pnpm db:migrate:verify` stays
clean (the constraints do not count as drift), and proving they exist is the job
of a test, not of the diff.
