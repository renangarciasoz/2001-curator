import { describe, expect, it } from 'vitest';

import { readSseEvents } from './sse-events.util';

/**
 * The buffering here is the kind of code that looks obviously correct and is
 * intermittently wrong in production: a network chunk respects no event
 * boundary, so the failure mode is text going missing under load and never in
 * front of anyone. These cases drive the stream in the awkward shapes a real
 * connection produces.
 */
describe('readSseEvents', () => {
  /** A body that hands over exactly these chunks, in order. */
  function streamOf(chunks: readonly string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();

    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }

        controller.close();
      },
    });
  }

  async function collect(chunks: readonly string[]): Promise<unknown[]> {
    const payloads: unknown[] = [];

    for await (const payload of readSseEvents(streamOf(chunks))) {
      payloads.push(payload);
    }

    return payloads;
  }

  it('reads one event per chunk', async () => {
    expect(await collect(['data: {"kind":"text","delta":"oi"}\n\n'])).toEqual([
      { kind: 'text', delta: 'oi' },
    ]);
  });

  it('reads several events arriving in one chunk', async () => {
    const chunk = 'data: {"n":1}\n\ndata: {"n":2}\n\ndata: {"n":3}\n\n';

    expect(await collect([chunk])).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  it('reassembles a payload split across chunks', async () => {
    expect(await collect(['data: {"kind":"te', 'xt","delta":"oi"}', '\n\n'])).toEqual([
      { kind: 'text', delta: 'oi' },
    ]);
  });

  it('reassembles a boundary split across chunks', async () => {
    expect(await collect(['data: {"n":1}\n', '\ndata: {"n":2}\n\n'])).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('survives a multi-byte character cut in half', async () => {
    // "coração" — the ã is two bytes, and the split falls between them. Without
    // a streaming decoder this yields a replacement character.
    const encoded = new TextEncoder().encode('data: {"t":"coração"}\n\n');
    const head = encoded.slice(0, 18);
    const tail = encoded.slice(18);

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(head);
        controller.enqueue(tail);
        controller.close();
      },
    });

    const payloads: unknown[] = [];

    for await (const payload of readSseEvents(body)) {
      payloads.push(payload);
    }

    expect(payloads).toEqual([{ t: 'coração' }]);
  });

  it('drops a truncated event instead of throwing', async () => {
    // What a dropped connection leaves behind: a complete event, then half of
    // one. Losing the half beats killing the conversation.
    expect(await collect(['data: {"n":1}\n\ndata: {"n":\n\n'])).toEqual([{ n: 1 }]);
  });

  it('ignores lines that are not data', async () => {
    expect(await collect([': keepalive\n\ndata: {"n":1}\n\n'])).toEqual([{ n: 1 }]);
  });

  it('yields a payload that is literally null', async () => {
    // `null` is a value the server can send; it is not "no event here".
    expect(await collect(['data: null\n\n'])).toEqual([null]);
  });

  it('ignores a trailing event with no boundary', async () => {
    // The stream closed mid-event. Nothing can be said about it honestly.
    expect(await collect(['data: {"n":1}\n\ndata: {"n":2}'])).toEqual([{ n: 1 }]);
  });

  it('yields nothing for an empty stream', async () => {
    expect(await collect([])).toEqual([]);
  });
});
