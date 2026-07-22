'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback : sélectionne l'input voisin, mais la plupart des browsers
      // modernes ont clipboard API. Silence si ça fail.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="btn btn-primary"
      style={{ whiteSpace: 'nowrap' }}
    >
      {copied ? <><Icon name="check" size={14} /> Copié</> : 'Copier'}
    </button>
  );
}
