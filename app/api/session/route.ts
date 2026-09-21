import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireCurator } from '@/server/auth.service';
import { db } from '@/server/db.service';
import { respondError } from '@/server/http-response.util';
import { createSession } from '@/server/session.service';

const CreateSessionSchema = z.object({
  /** Viewer persona to attach to the session. Created if it does not exist yet. */
  userId: z.string().trim().min(1).max(120).optional(),
});

/** Opens a chat session for the signed-in curator. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const curator = await requireCurator();
    const { userId } = CreateSessionSchema.parse(await request.json());

    const profileId = userId === undefined ? null : await ensureProfile(userId);
    const sessionId = await createSession(curator, profileId);

    return NextResponse.json({ sessionId, curator, profileId }, { status: 201 });
  } catch (e) {
    return respondError(e);
  }
}

async function ensureProfile(userId: string): Promise<string> {
  const profile = await db.profile.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true },
  });

  return profile.id;
}
