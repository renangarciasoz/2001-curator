/**
 * Reads a `text/event-stream` body and yields one object per event.
 *
 * A network chunk does not respect event boundaries: it can cut a JSON payload
 * in half or carry three events at once. That is what the buffer is for —
 * without it the chat loses text intermittently, in a way that is hard to
 * reproduce.
 */
export async function* readSseEvents<TEvent>(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<TEvent> {
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

        const event = parseEvent<TEvent>(raw);

        if (event !== null) {
          yield event;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseEvent<TEvent>(raw: string): TEvent | null {
  const line = raw.split('\n').find((candidate) => candidate.startsWith('data: '));

  if (line === undefined) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(line.slice('data: '.length));

    return parsed as TEvent;
  } catch {
    // Event truncated by a dropped connection: ignoring beats killing the chat.
    return null;
  }
}
