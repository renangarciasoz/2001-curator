import 'server-only';

import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma único por processo.
 *
 * O hot reload do Next em dev recria o módulo a cada alteração; sem o cache no
 * globalThis cada recarga abriria um novo pool e o Postgres esgotaria conexões.
 */
const globalParaPrisma = globalThis as typeof globalThis & {
  prismaClient?: PrismaClient;
};

export const db: PrismaClient =
  globalParaPrisma.prismaClient ??
  new PrismaClient({
    log: process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalParaPrisma.prismaClient = db;
}
