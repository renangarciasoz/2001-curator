import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { CURADORAS } from '@/lib/curadora.constant';
import { curadoraAtual, entrar, sair } from '@/server/auth.service';
import { responderErro } from '@/server/resposta-http.util';

const EntrarSchema = z.object({
  curadora: z.enum(CURADORAS),
  senha: z.string().default(''),
});

/** Quem está nesta sessão do navegador. */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(
      { curadora: await curadoraAtual() },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (e) {
    return responderErro(e);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { curadora, senha } = EntrarSchema.parse(await request.json());

    await entrar(curadora, senha);

    return NextResponse.json({ curadora }, { status: 200 });
  } catch (e) {
    return responderErro(e);
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    await sair();

    return NextResponse.json({ curadora: null }, { status: 200 });
  } catch (e) {
    return responderErro(e);
  }
}
