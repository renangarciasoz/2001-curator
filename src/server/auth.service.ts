import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { cookies } from 'next/headers';

import { CuratorNotAuthenticatedError, InvalidConfigurationError } from '@/lib/app-error.util';
import { isCurator } from '@/lib/curator.constant';

import { env } from './env.config';

import type { CuratorName } from '@/lib/curator.constant';

const COOKIE_NAME = 'curator_2001_session';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Signs a curator into this browser session.
 *
 * The cookie is HMAC-signed so nobody can change identity by editing the value.
 * What matters here is not secrecy but correct attribution of every review in
 * the dataset.
 *
 * `APP_CURATION_PASSWORD` is optional in development, where the tool is only
 * reachable on localhost and typing a password on every reload buys nothing.
 * It is mandatory in production: without it, anyone who finds the URL picks a
 * curator's name and writes to the dataset under it — which is the one asset
 * this whole project exists to protect.
 *
 * @throws {CuratorNotAuthenticatedError} when the password does not match, or
 *   when production has no password configured at all.
 */
export async function signIn(curator: CuratorName, password: string): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && env.APP_CURATION_PASSWORD.length === 0) {
    // Its own error type, not a failed sign-in: the operator needs to see a
    // missing setting, not a curator wondering whether she mistyped.
    throw new InvalidConfigurationError('APP_CURATION_PASSWORD is required in production');
  }

  if (env.APP_CURATION_PASSWORD.length > 0 && !passwordMatches(password)) {
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
