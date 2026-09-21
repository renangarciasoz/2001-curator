'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Leaving the session matters here: whoever is signed in is who every review
 * gets attributed to, so switching between Sonia and Mirella has to be one
 * click away rather than a cookie to clear by hand.
 */
export function SignOut() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function signOut(): Promise<void> {
    setLeaving(true);

    try {
      await fetch('/api/auth', { method: 'DELETE' });
      router.refresh();
    } finally {
      setLeaving(false);
    }
  }

  return (
    <button
      type="button"
      disabled={leaving}
      className="label-caps cursor-pointer underline decoration-rule underline-offset-4 transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      onClick={() => void signOut()}
    >
      {leaving ? 'Saindo…' : 'Sair'}
    </button>
  );
}
