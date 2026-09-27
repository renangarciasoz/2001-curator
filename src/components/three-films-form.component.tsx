'use client';

import { useState } from 'react';

/** Sonia's rule, and the product's: three is the number, going in and coming out. */
const SLOTS = [0, 1, 2] as const;

/**
 * The main entrance: three films the person loved.
 *
 * It replaces a questionnaire with a question that is pleasant to answer.
 * "Which films stayed with you" takes seconds, does not feel like a form, and
 * the answer says more about someone than any list of genres and moods would —
 * it is how the 2001 counter actually worked.
 *
 * What leaves here is a sentence, not a payload. The transcript is the dataset's
 * record of what was said, and a structured object smuggled into it would make
 * the conversation unreadable later; the Method is what teaches the Indicador to
 * read this shape as a portrait rather than as a similarity search.
 */
export function ThreeFilmsForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (message: string) => void;
}) {
  const [films, setFilms] = useState<readonly string[]>(['', '', '']);

  const named = films.map((film) => film.trim()).filter((film) => film.length > 0);

  function submit(): void {
    if (named.length === 0 || disabled) {
      return;
    }

    onSubmit(`Filmes que ficaram comigo: ${named.join(', ')}.`);
  }

  return (
    <form
      className="mt-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h2 className="font-display text-[26px] leading-tight font-light text-balance">
        Quais filmes ficaram com você?
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-signal-dim text-pretty">
        Três que você viu, gostou muito, e que combinam com o que quer assistir hoje. A partir deles
        o Indicador escolhe três do acervo — com um aperitivo de cada um.
      </p>

      <div className="mt-6 space-y-px border border-seam bg-seam">
        {SLOTS.map((slot) => (
          <div key={slot} className="flex items-center gap-3 bg-panel px-3">
            <label htmlFor={`film-${String(slot)}`} className="label-caps shrink-0">
              {slot + 1}
            </label>
            <input
              id={`film-${String(slot)}`}
              value={films[slot] ?? ''}
              disabled={disabled}
              // Only the first: focusing every field in turn would fight the
              // person typing, and on a phone it would open the keyboard over
              // the fields they have not reached yet.
              autoFocus={slot === 0}
              className="w-full border-0 bg-transparent py-3 font-ui text-[16px] text-signal placeholder:text-signal-faint focus:outline-none"
              placeholder={PLACEHOLDERS[slot]}
              onChange={(event) => {
                const value = event.target.value;

                setFilms((previous) => previous.map((film, at) => (at === slot ? value : film)));
              }}
            />
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={disabled || named.length === 0}
        className="btn btn-primary mt-5 w-full justify-center sm:w-auto"
      >
        Quero minhas 3 indicações
      </button>

      {/*
        The second door, and it stays visible rather than appearing on a
        condition: someone who already knows what they want should never have
        to discover that the other way in exists.
      */}
      <p className="mt-4 border-t border-seam pt-4 text-[14px] leading-relaxed text-signal-dim">
        Já sabe o que quer assistir? Escreva direto no campo lá embaixo — um diretor, um ator, um
        gênero, ou o que está em cartaz.
      </p>
    </form>
  );
}

/** Deliberately unalike: three of a kind would read as a genre filter. */
const PLACEHOLDERS = ['As Horas', 'Cinema Paradiso', 'Pulp Fiction'] as const;
