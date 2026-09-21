import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 pt-8 pb-28 sm:px-8">
      <p className="label-caps mb-4">404</p>
      <h1 className="font-display text-[40px] leading-[1.05] font-light">Não encontrado</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-signal-dim">
        Esta página não existe — ou é a conversa de outra curadora.
      </p>
      <p className="mt-8">
        <Link href="/" className="btn btn-quiet">
          Voltar ao início
        </Link>
      </p>
    </div>
  );
}
