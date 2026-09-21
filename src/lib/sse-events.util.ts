/**
 * Reads a `text/event-stream` body and yields one parsed payload per event.
 *
 * A network chunk does not respect event boundaries: it can cut a JSON payload
 * in half or carry three events at once. That is what the buffer is for —
 * without it the chat loses text intermittently, in a way that is hard to
 * reproduce.
 *
 * Payloads come back as `unknown` on purpose. This is a deserialization
 * boundary, so the caller narrows to its own event type instead of the reader
 * asserting a shape it cannot verify.
 */
export async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');

      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);

        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');

        const parsed = parseEvent(raw);

        if (parsed.ok) {
          yield parsed.value;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * A result wrapper rather than `unknown | null`: an event whose payload is
 * literally `null` is still an event, and must not be confused with "no event
 * here".
 */
function parseEvent(raw: string): { ok: true; value: unknown } | { ok: false } {
  const line = raw.split('\n').find((candidate) => candidate.startsWith('data: '));

  if (line === undefined) {
    return { ok: false };
  }

  try {
    const value: unknown = JSON.parse(line.slice('data: '.length));

    return { ok: true, value };
  } catch {
    // Event truncated by a dropped connection: ignoring beats killing the chat.
    return { ok: false };
  }
}
