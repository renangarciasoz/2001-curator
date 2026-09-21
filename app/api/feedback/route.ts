import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { exigirCuradora } from '@/server/auth.service';
import { responderErro } from '@/server/resposta-http.util';
import {
  DescartarNovoSchema,
  RegistrarFeedbackInputSchema,
  descartarFeedback,
  registrarDescarteNovo,
  registrarFeedback,
} from '@/server/tools/registrar-feedback.service';

const DescartarSchema = z.union([
  z.object({
    conversaId: z.uuid(),
    motivo: z.string().trim().min(1).max(2000),
  }),
  DescartarNovoSchema,
]);

/**
 * Registra a avaliação de uma recomendação.
 *
 * Caminho direto da interface de correção — não passa pelo modelo. O porquê que
 * a curadora escreve chega aqui exatamente como ela escreveu, e o portão de
 * qualidade decide o que fazer com ele. Um 422 significa que nada foi gravado e
 * a interface precisa fazer a pergunta que vem no corpo.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await exigirCuradora();

    const input = RegistrarFeedbackInputSchema.parse(await request.json());

    return NextResponse.json(await registrarFeedback(input), { status: 201 });
  } catch (e) {
    return responderErro(e);
  }
}

/**
 * Marca uma conversa como descartada quando a curadora não quis esclarecer.
 *
 * Registrar o descarte é deliberado: apagar faria a Fase 2 pensar que aquela
 * recomendação nunca foi avaliada.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    await exigirCuradora();

    const corpo = DescartarSchema.parse(await request.json());

    if ('conversaId' in corpo) {
      await descartarFeedback(corpo.conversaId, corpo.motivo);

      return NextResponse.json({ conversaId: corpo.conversaId, qualidade: 'DESCARTA' });
    }

    const conversaId = await registrarDescarteNovo(corpo);

    return NextResponse.json({ conversaId, qualidade: 'DESCARTA' }, { status: 201 });
  } catch (e) {
    return responderErro(e);
  }
}
