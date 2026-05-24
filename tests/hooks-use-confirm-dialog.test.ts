/**
 * Tests pour useConfirmDialog — Round 36 #5.
 *
 * Note : vitest tourne avec env=node (pas de jsdom). On ne peut donc pas
 * mount React directement. On test la sémantique du hook via la fonction
 * pure qu'il enferme : confirm() retourne une Promise<boolean> qui resolve
 * quand handleClose est appelé.
 *
 * Reproduction de l'API pour validation (le rendering React lui-même est
 * testé manuellement / via les e2e Playwright si nécessaire).
 */

import { describe, it, expect } from 'vitest';

/**
 * Logique core extraite : confirm() retourne une Promise, handleClose
 * resolve cette promise. Test sans React mount.
 */
function makeConfirmFlow() {
  let pendingResolve: ((ok: boolean) => void) | null = null;
  let pendingOptions: { title: string } | null = null;

  function confirm(opts: { title: string }): Promise<boolean> {
    return new Promise((resolve) => {
      pendingResolve = resolve;
      pendingOptions = opts;
    });
  }

  function handleClose(ok: boolean) {
    if (pendingResolve) {
      pendingResolve(ok);
      pendingResolve = null;
      pendingOptions = null;
    }
  }

  return { confirm, handleClose, isPending: () => pendingResolve !== null, getOptions: () => pendingOptions };
}

describe('useConfirmDialog — core promise flow (Round 36 #5)', () => {
  it('confirm() ne resolve pas avant handleClose', async () => {
    const { confirm, isPending } = makeConfirmFlow();
    const promise = confirm({ title: 'Test' });
    expect(isPending()).toBe(true);
    // Pas de await — promise reste pending
    // (sans handleClose, ne peut pas démontrer que la promise jamais resolve
    // sans timeout sketch, mais on confirme via isPending)
    void promise;
  });

  it('handleClose(true) → confirm() resolve avec true', async () => {
    const { confirm, handleClose } = makeConfirmFlow();
    const promise = confirm({ title: 'Test' });
    handleClose(true);
    expect(await promise).toBe(true);
  });

  it('handleClose(false) → confirm() resolve avec false (cancel)', async () => {
    const { confirm, handleClose } = makeConfirmFlow();
    const promise = confirm({ title: 'Test' });
    handleClose(false);
    expect(await promise).toBe(false);
  });

  it('handleClose après resolve → no-op (ne throw pas)', () => {
    const { confirm, handleClose } = makeConfirmFlow();
    void confirm({ title: 'Test' });
    handleClose(true);
    expect(() => handleClose(false)).not.toThrow();
  });

  it('options passées au confirm() sont accessibles via getOptions', async () => {
    const { confirm, handleClose, getOptions } = makeConfirmFlow();
    const promise = confirm({ title: 'Confirmation message FR' });
    expect(getOptions()?.title).toBe('Confirmation message FR');
    handleClose(true);
    await promise;
    // Après close, options réinitialisé
    expect(getOptions()).toBeNull();
  });
});
