import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { cookies } from 'next/headers';

import { CuratorNotAuthenticatedError } from '@/lib/app-error.util';
import { isCurator } from '@/lib/curator.constant';

import { env } from './env.config';

import type { CuratorName } from '@/lib/curator.constant';

const COOKIE_NAME = 'curator_2001_session';
// A year: they identify themselves once and the tool stops asking.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Records who is using the tool in this browser.
 *
 * This is identification, not authentication. Sonia and Mirella tap their name
 * once and the cookie carries it for a year; there is no password unless
 * `APP_CURATION_PASSWORD` is set, which it is not locally and is on a public
 * deployment.
 *
 * The password guards *entry*, not every call. Someone already carrying a valid
 * cookie is past the door, so switching between Sonia and Mirella stays the one
 * tap it has to be — a curator correcting whose name is on her reviews must not
 * be sent back to a password prompt to do it.
 *
 * The cookie is HMAC-signed either way, because the name in it decides who
 * every review in the dataset is attributed to. Signing stops the value being
 * edited by hand; on its own it keeps nobody out.
 *
 * @throws {CuratorNotAuthenticatedError} when a password is configured, nobody
 *   is signed in yet, and the password does not match.
 */
export async function signIn(curator: CuratorName, password: string): Promise<void> {
  const alreadyIdentified = await currentCurator();

  if (
    alreadyIdentified === null &&
    env.APP_CURATION_PASSWORD.length > 0 &&
    !passwordMatches(password)
  ) {
    throw new CuratorNotAuthenticatedError('curation password does not match');
  }

  const jar = await cookies();

  jar.set(COOKIE_NAME, `${curator}.${sign(curator)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export async function signOut(): Promise<void> {
  const jar = await cookies();

  jar.delete(COOKIE_NAME);
}

/** The curator in this session, or `null` if nobody signed in. */
export async function currentCurator(): Promise<CuratorName | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;

  if (raw === undefined) {
    return null;
  }

  const separator = raw.lastIndexOf('.');

  if (separator === -1) {
    return null;
  }

  const name = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);

  if (!isCurator(name) || !signatureMatches(name, signature)) {
    return null;
  }

  return name;
}

/**
 * Same as `currentCurator`, but for the paths that make no sense without an
 * identity — every route that writes curation data goes through here.
 *
 * @throws {CuratorNotAuthenticatedError} when there is no curator in the session.
 */
export async function requireCurator(): Promise<CuratorName> {
  const curator = await currentCurator();

  if (curator === null) {
    throw new CuratorNotAuthenticatedError();
  }

  return curator;
}

function sign(value: string): string {
  return createHmac('sha256', env.APP_SESSION_SECRET).update(value).digest('hex');
}

function signatureMatches(value: string, signature: string): boolean {
  return constantTimeEquals(sign(value), signature);
}

function passwordMatches(password: string): boolean {
  return constantTimeEquals(env.APP_CURATION_PASSWORD, password);
}

/** Constant-time comparison: does not leak secrets through response timing. */
function constantTimeEquals(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}
