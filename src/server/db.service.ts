import 'server-only';

import { PrismaClient } from '@prisma/client';

/**
 * One Prisma client per process.
 *
 * Next's hot reload re-creates the module on every edit; without the cache on
 * globalThis each reload would open a new pool and Postgres would run out of
 * connections.
 */
const globalForPrisma = globalThis as typeof globalThis & {
  prismaClient?: PrismaClient;
};

export const db: PrismaClient =
  globalForPrisma.prismaClient ??
  new PrismaClient({
    log: process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prismaClient = db;
}
