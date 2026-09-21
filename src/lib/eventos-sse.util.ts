/**
 * Lê um corpo `text/event-stream` e entrega um objeto por evento.
 *
 * Um chunk da rede não respeita a fronteira do evento: ele pode cortar um JSON
 * ao meio ou trazer três eventos de uma vez. O buffer aqui existe por isso —
 * sem ele o chat perde texto de forma intermitente e difícil de reproduzir.
 */
export async function* lerEventosSse<TEvento>(
  corpo: ReadableStream<Uint8Array>,
): AsyncGenerator<TEvento> {
  const leitor = corpo.getReader();
  const decodificador = new TextDecoder();

  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await leitor.read();

      if (done) {
        break;
      }

      buffer += decodificador.decode(value, { stream: true });

      let separador = buffer.indexOf('\n\n');

      while (separador !== -1) {
        const bruto = buffer.slice(0, separador);

        buffer = buffer.slice(separador + 2);
        separador = buffer.indexOf('\n\n');

        const evento = interpretar<TEvento>(bruto);

        if (evento !== null) {
          yield evento;
        }
      }
    }
  } finally {
    leitor.releaseLock();
  }
}

function interpretar<TEvento>(bruto: string): TEvento | null {
  const linha = bruto.split('\n').find((candidata) => candidata.startsWith('data: '));

  if (linha === undefined) {
    return null;
  }

  try {
    return JSON.parse(linha.slice('data: '.length)) as TEvento;
  } catch {
    // Evento truncado por queda de conexão: ignorar é melhor que derrubar o chat.
    return null;
  }
}
