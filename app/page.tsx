import Link from 'next/link';

import { AbrirSessao } from '@/components/abrir-sessao.component';
import { SeletorDeCuradora } from '@/components/seletor-de-curadora.component';
import { nomeDaCuradora } from '@/lib/curadora.constant';
import { curadoraAtual } from '@/server/auth.service';
import { db } from '@/server/db.service';
import { env } from '@/server/env.config';

export default async function Inicio() {
  const curadora = await curadoraAtual();

  if (curadora === null) {
    return (
      <main>
        <h1>Indicador 2001</h1>
        <p className="sutil">Curadoria da 2001 Vídeo. Ferramenta interna.</p>
        <SeletorDeCuradora exigeSenha={env.APP_SENHA_CURADORIA.length > 0} />
      </main>
    );
  }

  const [filmes, comCuradoria, conversasAbsorvidas, conversasEmRevisao] = await Promise.all([
    db.filme.count(),
    db.filme.count({ where: { fonteCuratorial: 'CURADORIA_2001' } }),
    db.conversa.count({ where: { qualidade: 'ABSORVE' } }),
    db.conversa.count({ where: { qualidade: 'REVISAR' } }),
  ]);

  return (
    <main>
      <div className="cabecalho">
        <div>
          <h1>Indicador 2001</h1>
          <p className="sutil">Você entrou como {nomeDaCuradora(curadora)}.</p>
        </div>
        <Link href="/conversas">Ver conversas registradas</Link>
      </div>

      <AbrirSessao />

      <h2>O acervo hoje</h2>
      <div className="rolagem">
        <table>
          <tbody>
            <tr>
              <th scope="row">Filmes no acervo</th>
              <td>{filmes}</td>
            </tr>
            <tr>
              <th scope="row">Com estudo das curadoras</th>
              <td>
                {comCuradoria}
                {filmes > comCuradoria ? (
                  <span className="sutil">
                    {' '}
                    — {filmes - comCuradoria} ainda sem camada curatorial
                  </span>
                ) : null}
              </td>
            </tr>
            <tr>
              <th scope="row">Conversas absorvidas no dataset</th>
              <td>{conversasAbsorvidas}</td>
            </tr>
            <tr>
              <th scope="row">Conversas em revisão (divergência)</th>
              <td>{conversasEmRevisao}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
