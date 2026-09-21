import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { cookies } from 'next/headers';

import { CuradoraNaoAutenticadaError } from '@/lib/app-error.util';
import { ehCuradora } from '@/lib/curadora.constant';

import { env } from './env.config';

import type { Curadora } from '@/lib/curadora.constant';

const NOME_DO_COOKIE = 'indicador_curadora';
const DURACAO_EM_SEGUNDOS = 60 * 60 * 24 * 30;

/**
 * Registra a curadora nesta sessão do navegador.
 *
 * O cookie é assinado com HMAC para que ninguém troque de identidade editando o
 * valor — o que importaria aqui não é sigilo, é a atribuição correta de cada
 * avaliação no dataset.
 *
 * @throws {CuradoraNaoAutenticadaError} quando a senha compartilhada não confere.
 */
export async function entrar(curadora: Curadora, senha: string): Promise<void> {
  if (env.APP_SENHA_CURADORIA.length > 0 && !senhaConfere(senha)) {
    throw new CuradoraNaoAutenticadaError('senha de curadoria incorreta');
  }

  const jarra = await cookies();

  jarra.set(NOME_DO_COOKIE, `${curadora}.${assinar(curadora)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: DURACAO_EM_SEGUNDOS,
  });
}

export async function sair(): Promise<void> {
  const jarra = await cookies();

  jarra.delete(NOME_DO_COOKIE);
}

/** A curadora desta sessão, ou `null` se ninguém entrou. */
export async function curadoraAtual(): Promise<Curadora | null> {
  const jarra = await cookies();
  const cru = jarra.get(NOME_DO_COOKIE)?.value;

  if (cru === undefined) {
    return null;
  }

  const separador = cru.lastIndexOf('.');
  const nome = cru.slice(0, separador);
  const assinatura = cru.slice(separador + 1);

  if (!ehCuradora(nome) || !assinaturaConfere(nome, assinatura)) {
    return null;
  }

  return nome;
}

/**
 * Igual a `curadoraAtual`, mas para os caminhos que não fazem sentido sem
 * identidade — toda rota que grava dado de curadoria passa por aqui.
 *
 * @throws {CuradoraNaoAutenticadaError} quando não há curadora na sessão.
 */
export async function exigirCuradora(): Promise<Curadora> {
  const curadora = await curadoraAtual();

  if (curadora === null) {
    throw new CuradoraNaoAutenticadaError();
  }

  return curadora;
}

function assinar(valor: string): string {
  return createHmac('sha256', env.APP_SESSION_SECRET).update(valor).digest('hex');
}

function assinaturaConfere(valor: string, assinatura: string): boolean {
  return comparacaoConstante(assinar(valor), assinatura);
}

function senhaConfere(senha: string): boolean {
  return comparacaoConstante(env.APP_SENHA_CURADORIA, senha);
}

/** Comparação de tempo constante: evita distinguir segredos pelo tempo de resposta. */
function comparacaoConstante(esperado: string, recebido: string): boolean {
  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(recebido, 'utf8');

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}
