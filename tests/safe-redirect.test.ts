/**
 * Régression sécurité (Round 1 audit) — safeInternalPath contre l'open-redirect.
 */

import { describe, it, expect } from 'vitest';
import { safeInternalPath } from '@/lib/auth/safe-redirect';

describe('safeInternalPath', () => {
  it('laisse passer un chemin interne relatif', () => {
    expect(safeInternalPath('/orders')).toBe('/orders');
    expect(safeInternalPath('/order/start?x=1&y=2')).toBe('/order/start?x=1&y=2');
    expect(safeInternalPath('/account#section')).toBe('/account#section');
  });

  it('rejette les cibles externes / déguisées → fallback', () => {
    const cases = [
      'https://evil.com',
      'http://evil.com/path',
      '//evil.com',
      '/\\evil.com',
      '\\evil.com',
      'javascript:alert(1)',
      'data:text/html,<script>',
      'evil.com', // pas de leading /
      '',
      undefined,
      null,
    ];
    for (const c of cases) {
      expect(safeInternalPath(c as string | undefined)).toBe('/orders');
    }
  });

  it('respecte un fallback custom', () => {
    expect(safeInternalPath('https://evil.com', '/account')).toBe('/account');
    expect(safeInternalPath(undefined, '/')).toBe('/');
  });
});
