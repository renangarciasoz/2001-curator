import 'server-only';

import { ProviderUnavailableError } from '@/lib/app-error.util';

/**
 * Attempts, including the first. Four gives roughly seven seconds of patience
 * with the backoff below — long enough to ride out a burst, short enough that a
 * curator waiting on a search does not think the app has died.
 */
const MAX_ATTEMPTS = 4;

/** First backoff. Doubles each attempt: 1s, 2s, 4s. */
const BASE_DELAY_MS = 1000;

/**
 * A provider asking for a longer wait than this is telling us the quota is
 * gone, not that we arrived a moment early. Failing then is more honest than
 * holding an indexing run — or a curator — for a minute.
 */
const MAX_HONOURED_RETRY_AFTER_MS = 20_000;

/** How much of an error body to quote. Enough to carry a provider's message. */
const BODY_EXCERPT = 300;

/**
 * POSTs to an embeddings provider, retrying the failures that are worth
 * retrying.
 *
 * A 429 is the normal response to indexing the archive right after indexing it
 * somewhere else, and it used to abort the whole run: the script stopped,
 * having marked some films as indexed and not others. Rate limits are a
 * scheduling problem, not an error — so they are waited out, honouring
 * `Retry-After` when the provider sends one. 5xx is retried for the same
 * reason. Everything else (401, 400, an unknown model) is a fact about the
 * request that a second attempt cannot change, and fails immediately.
 *
 * @throws {ProviderUnavailableError} on a non-retryable status, on a network
 *   failure, or once the attempts are spent.
 */
export async function postWithRetry(
  provider: string,
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(url, { ...init, cache: 'no-store', signal: signal ?? null });
    } catch (e) {
      // An aborted request is the caller leaving, not a provider failure.
      if (signal?.aborted === true) {
        throw e;
      }

      throw new ProviderUnavailableError(provider, 'network failure', { cause: e });
    }

    if (response.ok) {
      return response;
    }

    lastStatus = response.status;

    if (!isWorthRetrying(response.status) || attempt === MAX_ATTEMPTS) {
      throw new ProviderUnavailableError(
        provider,
        `HTTP ${String(response.status)}${await excerpt(response)}`,
      );
    }

    await sleep(delayFor(response, attempt), signal);
  }

  // Unreachable: the loop either returns or throws. Kept so the function has a
  // single, honest exit type rather than a non-null assertion.
  throw new ProviderUnavailableError(provider, `HTTP ${String(lastStatus)} after retries`);
}

/** 429 is a queue; 5xx is a bad moment. Both pass. 4xx otherwise is a verdict. */
function isWorthRetrying(status: number): boolean {
  return status === 429 || status >= 500;
}

function delayFor(response: Response, attempt: number): number {
  const requested = retryAfterMs(response.headers.get('retry-after'));

  if (requested !== null) {
    return Math.min(requested, MAX_HONOURED_RETRY_AFTER_MS);
  }

  // Jitter: several batches backing off in lockstep would collide again.
  return BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
}

/** `Retry-After` is either seconds or an HTTP date. Both are in the wild. */
function retryAfterMs(header: string | null): number | null {
  if (header === null) {
    return null;
  }

  const seconds = Number(header);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const at = Date.parse(header);

  if (Number.isNaN(at)) {
    return null;
  }

  return Math.max(0, at - Date.now());
}

/** A timer that an abort can cut short, instead of one that ignores it. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new Error('aborted', { cause: signal.reason }));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort(): void {
      clearTimeout(timer);
      reject(new Error('aborted', { cause: signal?.reason }));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * The provider's own words, when it sent any.
 *
 * "HTTP 401" alone sends the reader to the wrong place: a rejected key, an
 * expired one and an account without credit all look identical.
 */
async function excerpt(response: Response): Promise<string> {
  try {
    const body = (await response.text()).trim();

    return body.length === 0 ? '' : ` — ${body.slice(0, BODY_EXCERPT)}`;
  } catch {
    return '';
  }
}
