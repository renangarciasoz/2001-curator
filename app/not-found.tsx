import Link from 'next/link';

export default function NaoEncontrado() {
  return (
    <main>
      <h1>Não encontrado</h1>
      <p className="sutil">Esta página não existe.</p>
      <p>
        <Link href="/">Voltar ao início</Link>
      </p>
    </main>
  );
}
