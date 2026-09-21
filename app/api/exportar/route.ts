import 'server-only';

import { exigirCuradora } from '@/server/auth.service';
import { exportarDatasetJsonl } from '@/server/exportador.service';
import { responderErro } from '@/server/resposta-http.util';

/**
 * Baixa o dataset curatorial em JSONL.
 *
 * Transmitido enquanto é gerado — o arquivo cresce com o uso da ferramenta e
 * não faz sentido montá-lo inteiro na memória para depois enviar.
 */
export async function GET(): Promise<Response> {
  try {
    await exigirCuradora();

    const codificador = new TextEncoder();
    const linhas = exportarDatasetJsonl();

    const corpo = new ReadableStream<Uint8Array>({
      async start(controlador) {
        try {
          for await (const linha of linhas) {
            controlador.enqueue(codificador.encode(linha));
          }
        } finally {
          controlador.close();
        }
      },
    });

    const carimbo = new Date().toISOString().slice(0, 10);

    return new Response(corpo, {
      status: 200,
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'content-disposition': `attachment; filename="indicador-2001-${carimbo}.jsonl"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return responderErro(e);
  }
}
