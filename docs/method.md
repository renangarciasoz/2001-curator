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

- Never hand over a single title — build bridges, guide a journey. At most
  **three options at a time**.
- Always ask about the last film that moved the person.
- Find out whether they want comfort, challenge, or discovery.
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

## Recommending first, asking second

Method 1 had the Indicador establish context before recommending anything. Sonia
read the transcripts and overruled it on 24/09/2026: the answers were too long,
there were too many questions before any film appeared, and a curator at the
counter needs the title and the reason, not an essay.

Method 2 inverts the default. Recommend on the first reply whenever anything can
be recommended — two or three films, one or two sentences of justification each.
If something essential is missing, ask **one** short question, and never on its
own: it travels alongside whatever can already be offered. Depth belongs to the
turns that follow.

What did not change is that the rule cannot live in the prompt text alone. On
every turn the orchestrator assembles a second system block — **after** the cache
breakpoint — with what is known about this session's viewer and what is still
unknown. Under Method 2 the unknowns are framed as a budget of one question
rather than as a gate:

```text
Espectador desta sessão: cliente-premium-ana (tratamento: premium).
Gosta de: Kurosawa, cinema japonês dos anos 50
Já assistiu: Os Sete Samurais (1954); Rashomon (1950)

Ainda não se sabe, sobre esta pessoa — no máximo UMA destas vira pergunta,
e sempre acompanhada de indicações:
  - como ela está hoje;
  - que repertório ela tem.
```

With no persona attached to the session, the block says so and lists the three
questions worth choosing between. The code is `buildSessionContext` in
[`src/server/session.service.ts`](../src/server/session.service.ts); what feeds
the block is the `Profile` entity.

Every recorded conversation stores the Method version it was produced under, in
`conversation.method_version`, and the exporter reads that column rather than
today's constant. Phase 2 has to be able to tell a correction of Method 1's
behaviour from a correction of Method 2's.

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
