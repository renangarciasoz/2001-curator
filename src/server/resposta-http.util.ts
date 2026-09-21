import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import {
  AppError,
  ConversaNaoEncontradaError,
  CuradoraNaoAutenticadaError,
  FeedbackAmbiguoError,
  FilmeNaoEncontradoError,
  ProviderIndisponivelError,
  SessaoNaoEncontradaError,
  descreverErro,
} from '@/lib/app-error.util';

/**
 * Traduz um erro de domínio em resposta HTTP.
 *
 * Nenhuma mensagem de exceção inesperada chega ao cliente: só o código estável
 * e um texto seguro. O detalhe fica no log do servidor.
 */
export function responderErro(e: unknown): NextResponse {
  if (e instanceof CuradoraNaoAutenticadaError) {
    return NextResponse.json({ erro: e.code, mensagem: e.message }, { status: 401 });
  }

  if (e instanceof FeedbackAmbiguoError) {
    // 422: a requisição está bem formada, mas o portão de qualidade não deixou
    // passar. A interface transforma isto numa pergunta à curadora.
    return NextResponse.json(
      {
        erro: e.code,
        mensagem: e.message,
        pedidoDeEsclarecimento: e.pedidoDeEsclarecimento,
        nadaFoiGravado: true,
      },
      { status: 422 },
    );
  }

  if (
    e instanceof FilmeNaoEncontradoError ||
    e instanceof SessaoNaoEncontradaError ||
    e instanceof ConversaNaoEncontradaError
  ) {
    return NextResponse.json({ erro: e.code, mensagem: e.message }, { status: 404 });
  }

  if (e instanceof ProviderIndisponivelError) {
    console.error(`Provider ${e.provider} indisponível: ${e.message}`);

    return NextResponse.json(
      { erro: e.code, mensagem: 'Um serviço externo não respondeu. Tente de novo.' },
      { status: 503 },
    );
  }

  if (e instanceof ZodError) {
    return NextResponse.json(
      {
        erro: 'entrada_invalida',
        mensagem: 'Dados inválidos.',
        campos: e.issues.map((issue) => ({
          campo: issue.path.join('.'),
          problema: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  if (e instanceof AppError) {
    return NextResponse.json({ erro: e.code, mensagem: e.message }, { status: 400 });
  }

  console.error(`Falha não tratada: ${descreverErro(e)}`);

  return NextResponse.json(
    { erro: 'falha_inesperada', mensagem: 'Algo deu errado. Tente de novo.' },
    { status: 500 },
  );
}
