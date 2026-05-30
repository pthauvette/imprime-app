import { describe, it, expect } from 'vitest';
import { ORDER_STATUS } from '@/lib/db/orders';
import { ORDER_STATUS_TONE, orderStatusTone } from '@/lib/orders/status-tone';
import { TONE_TOKENS } from '@/lib/ui/status-tone';

describe('ORDER_STATUS_TONE', () => {
  it('a un ton pour chaque OrderStatus (exhaustif)', () => {
    for (const s of ORDER_STATUS) {
      expect(ORDER_STATUS_TONE[s]).toBeTruthy();
    }
  });

  it('chaque ton mappé existe dans TONE_TOKENS', () => {
    for (const s of ORDER_STATUS) {
      expect(TONE_TOKENS[ORDER_STATUS_TONE[s]]).toBeDefined();
    }
  });

  it('orderStatusTone retombe sur neutral si statut inconnu', () => {
    expect(orderStatusTone('WAT')).toBe('neutral');
  });

  // Régression-guard : ces 3 statuts divergeaient entre customer et admin
  // (admin rendait SHIPPED en vert, DELIVERED en gris, PAID en bleu).
  // Le canon retenu = sémantique customer. Si quelqu'un re-diverge, ça casse.
  it('verrouille le canon des statuts historiquement divergents', () => {
    expect(ORDER_STATUS_TONE.PAID).toBe('accent');
    expect(ORDER_STATUS_TONE.SHIPPED).toBe('info');
    expect(ORDER_STATUS_TONE.DELIVERED).toBe('success');
  });
});
