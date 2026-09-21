import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { exigirCuradora } from '@/server/auth.service';
import { db } from '@/server/db.service';
import { responderErro } from '@/server/resposta-http.util';
import { criarSessao } from '@/server/sessao.service';

const CriarSessaoSchema = z.object({
  /** Persona de espectador a ligar à sessão. Criada se ainda não existir. */
  usuarioId: z.string().trim().min(1).max(120).optional(),
});

/** Abre uma sessão de chat para a curadora logada. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const curadora = await exigirCuradora();
    const { usuarioId } = CriarSessaoSchema.parse(await request.json());

    const perfilId = usuarioId === undefined ? null : await garantirPerfil(usuarioId);
    const sessaoId = await criarSessao(curadora, perfilId);

    return NextResponse.json({ sessaoId, curadora, perfilId }, { status: 201 });
  } catch (e) {
    return responderErro(e);
  }
}

async function garantirPerfil(usuarioId: string): Promise<string> {
  const perfil = await db.perfil.upsert({
    where: { usuarioId },
    create: { usuarioId },
    update: {},
    select: { id: true },
  });

  return perfil.id;
}
