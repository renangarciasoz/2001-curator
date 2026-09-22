import 'server-only';

import { requireCurator } from '@/server/auth.service';
import { exportDatasetJsonl } from '@/server/exporter.service';
import { respondError } from '@/server/http-response.util';

/**
 * Downloads the curatorial dataset as JSONL.
 *
 * Streamed while it is generated — the file grows with use of the tool and
 * there is no reason to assemble it whole in memory before sending.
 */
export async function GET(): Promise<Response> {
  try {
    await requireCurator();

    const encoder = new TextEncoder();
    const lines = exportDatasetJsonl();

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const line of lines) {
            controller.enqueue(encoder.encode(line));
          }
        } finally {
          controller.close();
        }
      },
    });

    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'content-disposition': `attachment; filename="2001-curator-${stamp}.jsonl"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return respondError(e);
  }
}
