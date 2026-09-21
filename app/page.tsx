import Link from 'next/link';

import { CuratorPicker } from '@/components/curator-picker.component';
import { OpenSession } from '@/components/open-session.component';
import { curatorLabel } from '@/lib/curator.constant';
import { currentCurator } from '@/server/auth.service';
import { db } from '@/server/db.service';
import { env } from '@/server/env.config';

export default async function Home() {
  const curator = await currentCurator();

  if (curator === null) {
    return (
      <main>
        <h1>Indicador 2001</h1>
        <p className="muted">Curadoria da 2001 Vídeo. Ferramenta interna.</p>
        <CuratorPicker requiresPassword={env.APP_CURATION_PASSWORD.length > 0} />
      </main>
    );
  }

  const [films, curated, absorbed, underReview] = await Promise.all([
    db.film.count(),
    db.film.count({ where: { curatorialSource: 'CURATION_2001' } }),
    db.conversation.count({ where: { quality: 'ABSORB' } }),
    db.conversation.count({ where: { quality: 'REVIEW' } }),
  ]);

  return (
    <main>
      <div className="header">
        <div>
          <h1>Indicador 2001</h1>
          <p className="muted">Você entrou como {curatorLabel(curator)}.</p>
        </div>
        <Link href="/conversations">Ver conversas registradas</Link>
      </div>

      <OpenSession />

      <h2>O acervo hoje</h2>
      <div className="scroll">
        <table>
          <tbody>
            <tr>
              <th scope="row">Filmes no acervo</th>
              <td>{films}</td>
            </tr>
            <tr>
              <th scope="row">Com estudo das curadoras</th>
              <td>
                {curated}
                {films > curated ? (
                  <span className="muted"> — {films - curated} ainda sem camada curatorial</span>
                ) : null}
              </td>
            </tr>
            <tr>
              <th scope="row">Conversas absorvidas no dataset</th>
              <td>{absorbed}</td>
            </tr>
            <tr>
              <th scope="row">Conversas em revisão (divergência)</th>
              <td>{underReview}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
