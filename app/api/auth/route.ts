import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { CURATORS } from '@/lib/curator.constant';
import { currentCurator, signIn, signOut } from '@/server/auth.service';
import { respondError } from '@/server/http-response.util';

const SignInSchema = z.object({
  curator: z.enum(CURATORS),
  password: z.string().default(''),
});

/** Who is in this browser session. */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(
      { curator: await currentCurator() },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (e) {
    return respondError(e);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { curator, password } = SignInSchema.parse(await request.json());

    await signIn(curator, password);

    return NextResponse.json({ curator }, { status: 200 });
  } catch (e) {
    return respondError(e);
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    await signOut();

    return NextResponse.json({ curator: null }, { status: 200 });
  } catch (e) {
    return respondError(e);
  }
}
