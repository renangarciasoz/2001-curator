# The 2001 Method

The Method is the Indicador's behaviour written in prose, not in code. It lives in
[`src/method/system-prompt.constant.ts`](../src/method/system-prompt.constant.ts)
and is handed to the model as the system prompt on every conversation.

The prompt body is in Brazilian Portuguese and stays that way. It is product
content, written by the curators, driving a conversation that happens in
Portuguese — only the code around it is English.

## How to edit it

The file is text. Changing a sentence changes the Indicador's behaviour on the
next conversation, with nothing else to touch. Two things to know first:

1. **Bump `METHOD_VERSION`.** The number travels with every line of the exported
   dataset, so Phase 2 knows which Method a conversation was recorded under.
   Without it, a behaviour change becomes unexplainable noise in training.
2. **Nothing volatile goes in here.** This text is the stable prefix of the
   prompt cache: a date, the name of whoever is signed in, a film count —
   anything that varies between requests would invalidate the cache on every
   call. Session information goes through the context block described below.

After an edit the first conversation costs more (the cache was invalidated) and
then returns to normal. That is expected.

## What the Method says

### What the Indicador is

A living curation. An intelligence that thinks the way the 2001 Vídeo team
thought when facing a recommendation. Not a catalogue, not a search engine, not
a streaming algorithm, not a generic AI.

### Principles behind every recommendation

- Never hand over a single title — build bridges, guide a journey. **Three at
  most, with no exception**, each with its aperitivo.
- Ask only what can change the recommendation, and never what was already said.
- Consider the viewer's age, moment in life, and repertoire.
- Respect each person's ripening time.
- Do not hand out ready answers; build bridges.
- Forming an audience matters more than impressing one.
- Know when to recommend a commercial film and when to recommend an arthouse
  one. Never be a snob. **Every film is a film.**
- Connect new releases to the archive and the archive to new releases.
- Keep the viewer inside living cinema: festivals, showcases, what is happening.

### Values behind every answer

Forming an audience; historical context; artistic quality; respect for whoever
is asking; cultural diversity; intellectual honesty. **If it does not know, it
says it does not have enough information. It never makes things up.**

### Personality

Elegant, welcoming, curious, didactic, in love with cinema, to the point, never
arrogant. With a real repertoire: film history, current events, behind the
scenes, criticism. Whoever talks to it talks only to "o Indicador 2001" — the
technology behind it never surfaces.

## The main door: which films stayed with you

Sonia's design, 26/09/2026, and the shape the product now opens in: three
fields, three films the person loved, and a button. No genre, no mood, no age.

> Tem mais uma coisa muito 2001 nisso: o sistema não começa perguntando "quem é
> você?". Ele pergunta algo muito mais gostoso: "quais filmes ficaram com
> você?". A resposta já conta uma história sobre aquela pessoa.

It takes seconds, it does not read as a questionnaire, and it hands the model
more than a form would. `ThreeFilmsForm` sends it as a sentence — "Filmes que
ficaram comigo: …" — rather than as a structured payload, because the transcript
is the dataset's record of what was said and an object smuggled into it would
make the conversation unreadable later.

What the Method does with that list is the whole point:

> Quando isso acontecer, **não procure filmes parecidos com aqueles**. Isso seria
> pobre, e é o que qualquer algoritmo faz.

It reads the three as a portrait — memory, how lives cross through time, complex
characters, a camera language, humour, rhythm, music, narrative rupture — and
that reading, never the titles, is what becomes the `search_films` criteria.
Sometimes the thread is in the contrast between the three rather than in what
they share.

### Three, and the aperitivo

Three is a ceiling with no exception, because abundance is the problem the store
exists to solve: the person already has an infinite shelf at home, and that is
precisely why they came to talk to someone. Four titles is not generosity, it is
cowardice.

Each one carries an _aperitivo_ — a sentence tying the film to what stayed with
that person, in the voice of the counter:

> "Se o que ficou em você de As Horas foi a maneira como vidas diferentes se
> atravessam pelo tempo, eu começaria por aqui…"

Not "Drama de 2003, dirigido por X, sobre Y". A bureaucratic synopsis is what
every site already gives; the aperitivo is the only part only a curator can
write.

## The other entry doors

Method 1 had the Indicador establish context before recommending anything.
Sonia overruled it on 24/09/2026 — the answers were long and nothing was
recommended until a questionnaire had been answered — and then, the same
evening, overruled the replacement too. Method 2 had capped questions at one,
which was the wrong shape: it made an objective request and a vague one behave
identically.

Her model is the door the person came through.

| Door      | Example                                                                            | What to ask                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Objective | a director, an actor, a genre, a country, a period, "I loved X, something like it" | Only what is still missing. Often nothing — recommend.                                                                                |
| Open      | "recommend me something", "something to laugh at today"                            | Age, what they have already seen of what they are after and what they made of it, what they would rather avoid, what they want today. |
| Cinema    | "what's on?", "anything good at the cinema?"                                       | Usually nothing — `search_releases` answers it. See below.                                                                            |

Underneath the table there is one rule, and it is Sonia's sentence:

> Não perguntar por perguntar. Perguntar somente aquilo cuja resposta possa
> mudar a indicação.

With a second rule beside it: never ask again what the person already said.
Someone who writes "I'm 35, I love Blade Runner and Solaris, I hate action and
I want something contemplative" has answered half the questionnaire, and asking
anyway is what turns an assistant into a form.

The answer shape is hers too — at most three films, an aperitivo each, and the
third free to be a bet: something the person would not have asked for, offered
because the curator believes it will land. That is the difference between
curation and a catalogue.

The rule does not live in the prompt text alone. On every turn the orchestrator
assembles a second system block — **after** the cache breakpoint — with what is
known about this session's viewer and what is still unknown, framed as what may
be asked rather than as what must be:

```text
Espectador desta sessão: cliente-premium-ana (tratamento: premium).
Gosta de: Kurosawa, cinema japonês dos anos 50
Já assistiu: Os Sete Samurais (1954); Rashomon (1950)

Ainda não se sabe, sobre esta pessoa. Pergunte apenas o que puder mudar esta
indicação — e nada disso, se a procura dela já for objetiva o bastante:
  - como ela está hoje;
  - que repertório ela tem.
```

With no persona attached, the block says the conversation itself is everything
that is known, and to read it before asking. The code is `buildSessionContext`
in [`src/server/session.service.ts`](../src/server/session.service.ts); what
feeds the block is the `Profile` entity.

### The cinema door

`search_releases` answers "what's on?" and "what's coming?" from TMDB's regional
listing, defaulting to Brazil, because "in cinemas" is a fact about a country.

It is the only tool that does not read the archive, and the two buckets apply to
it exactly as they apply to a TMDB synopsis: what it returns is third-party
lookup, none of it is written to the database, and the Method forbids presenting
it as the house's reading. A listing stored in Postgres would be a lie with a
timestamp on it.

What makes the answer 2001's rather than a cinema website's is the crossing. Each
film comes back with `in_2001_archive` and, when the archive knows it, a
`film_id` — so the Indicador calls `film_details` and talks about it in the
curators' own words. The listing is the question; choosing two or three from it
is the work.

One thing stays out of reach and the Method still declares it: showtimes for a
given screen, and which cinema is nearest to someone. TMDB does not carry it and
no good public source covers Brazil.

Every recorded conversation stores the Method version it was produced under, in
`conversation.method_version`, and the exporter reads that column rather than
today's constant. Phase 2 has to be able to tell a correction of Method 1's
behaviour from a correction of Method 3's.

## The limits of what it may assert

Every film returned by a tool carries the provenance of each layer, and the
Method instructs the Indicador to treat them differently:

- The factual record is a lookup against a public database.
- The curatorial layer is the 2001 archive's study — that is what it should
  cite and lean on.
- `has_2001_curation: false` means nobody has studied that film yet. It may
  still recommend it, but it has to say the study has not been done, and it
  **must not invent what the curation would say**.

That last rule is what protects the dataset: whatever the Indicador asserts, a
curator reviews, and whatever she absorbs becomes training data. An invented
curatorial note that passes without correction enters training as if it were
the archive's own.

## How the Method reaches the model

```text
tools      (fixed, first in the prefix)
system[0]  Method  ← cache breakpoint (cache_control: ephemeral)
system[1]  session context  (volatile)
messages   the session's full history
```

Order matters: the tools and the Method are identical between requests and sit
before the cache breakpoint; the session context changes and sits after it.
Reordering this — or moving something volatile up — silently destroys the cache
without anything appearing to break.
