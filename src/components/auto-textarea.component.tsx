'use client';

import { useLayoutEffect, useRef } from 'react';

import type { ComponentProps } from 'react';

/**
 * A textarea that is exactly as tall as what is written in it.
 *
 * The height is synced in a layout effect keyed on the value, not in an
 * `onChange` handler, and that is the whole point: a handler only fires when
 * the user types. It misses a paste handled elsewhere, autofill, an undo, and —
 * the one that mattered here — the parent clearing the draft after sending,
 * which left the box tall and empty until someone typed again.
 *
 * Nothing here touches `scrollTop`. Forcing it to the bottom on every keystroke
 * yanks the view away from a curator editing the middle of a long message;
 * browsers already keep the caret visible without help.
 *
 * Growth stops wherever the caller's CSS caps it (`max-h-*`), after which the
 * textarea scrolls on its own.
 */
export function AutoTextarea({
  value,
  ...props
}: Omit<ComponentProps<'textarea'>, 'ref' | 'rows'>) {
  const field = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = field.current;

    if (element === null) {
      return;
    }

    // `auto` first: without it `scrollHeight` can only ever grow, because it
    // reports the content height of an already-expanded box.
    element.style.height = 'auto';
    element.style.height = `${String(element.scrollHeight)}px`;
  }, [value]);

  return <textarea ref={field} value={value} rows={1} {...props} />;
}
