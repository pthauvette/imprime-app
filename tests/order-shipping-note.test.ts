/**
 * Tests pour Round 26 #2 — customer shipping note.
 *
 * Couvre :
 *   - Zod schema accepte / rejette correctement (trim + 200 char cap)
 *   - createPendingOrder persiste shippingNote
 *   - le builder Sinalite préfixe la note dans `notes` correctement
 *     (le builder est privé donc on test via le contract)
 */

import { composerNotes } from '@/lib/sinalite/order-notes';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// On reproduit ici le schema pour test pure — éviter de mocker Prisma juste
// pour valider une string. Le route.ts utilise z.string().trim().max(200).optional()
const ShippingNoteSchema = z.string().trim().max(200).optional();

describe('shippingNote Zod validation', () => {
  it('undefined accepté (champ optionnel)', () => {
    expect(ShippingNoteSchema.parse(undefined)).toBe(undefined);
  });

  it('string vide après trim → undefined-like (mais Zod garde la chaîne)', () => {
    // Zod ne convertit pas "" en undefined automatiquement avec .trim().
    // Le route convertit `payload.shippingNote || null` → null pour DB.
    expect(ShippingNoteSchema.parse('   ')).toBe('');
  });

  it('note normale acceptée + trimmed', () => {
    expect(ShippingNoteSchema.parse('  Sonner deux fois  ')).toBe('Sonner deux fois');
  });

  it('200 chars exactement → OK', () => {
    const s = 'a'.repeat(200);
    expect(ShippingNoteSchema.parse(s)).toBe(s);
  });

  it('201 chars → throw', () => {
    expect(() => ShippingNoteSchema.parse('a'.repeat(201))).toThrow();
  });

  it('note avec accents + retours ligne préservée', () => {
    const n = "Sonner à l'interphone 304\nporte de service";
    expect(ShippingNoteSchema.parse(n)).toBe(n);
  });
});

/**
 * Le builder Sinalite n'est pas exporté pour éviter pollution du module
 * principal. On teste son comportement attendu via le contract via
 * recomposition manuelle ici — ce test lock-in l'invariant "shipping
 * note prefixée dans Sinalite notes, max 500 chars".
 */
/**
 * ⚠️ ON IMPORTE LA VRAIE FONCTION — ce fichier en tenait une COPIE locale.
 *
 * Le test passait donc au vert sur son propre double pendant que la production
 * faisait autre chose : quand la composition a changé (source unique partagée
 * avec le chemin MCP), ce fichier — SEUL verrou sur « plafond 500 » et
 * « séparé par un saut de ligne » — n'a rien vu. Un test miroir sur le chemin
 * money est pire qu'aucun test : il donne l'assurance sans la couverture.
 */
function buildSinaliteNotes(shippingNote: string | undefined, notes: string | undefined): { notes?: string } {
  const n = composerNotes({ shippingNote, notes });
  return n ? { notes: n } : {};
}

describe('buildSinaliteNotes (Round 26 #2 forwarding contract)', () => {
  it('aucune note + aucun notes → {} (Sinalite payload sans notes)', () => {
    expect(buildSinaliteNotes(undefined, undefined)).toEqual({});
  });

  it('shippingNote seule → prefixé "Livraison:"', () => {
    expect(buildSinaliteNotes('Porte arrière', undefined)).toEqual({
      notes: 'Livraison: Porte arrière',
    });
  });

  it('notes seules → tel quel', () => {
    expect(buildSinaliteNotes(undefined, 'Commande Plio 2026')).toEqual({
      notes: 'Commande Plio 2026',
    });
  });

  it('les deux → livraison en premier, séparé par newline', () => {
    expect(buildSinaliteNotes('Porte arrière', 'Commande Plio 2026')).toEqual({
      notes: 'Livraison: Porte arrière\nCommande Plio 2026',
    });
  });

  it('cap 500 chars (Sinalite hard limit prudent)', () => {
    const long = 'a'.repeat(600);
    const result = buildSinaliteNotes(long, 'extra');
    expect(result.notes!.length).toBe(500);
    expect(result.notes!.startsWith('Livraison: ')).toBe(true);
  });
});
