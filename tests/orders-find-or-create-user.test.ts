/**
 * findOrCreateUserByEmail — audit v3 M4/L5.
 * Vérifie : création avec `name` composé ; compte existant = patch-only-missing
 * (jamais d'écrasement d'une identité saisie) + `name` recalculé.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const user = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(async (a: { data: Record<string, unknown> }) => a),
  update: vi.fn(async (a: { where?: unknown; data: Record<string, unknown> }) => a),
}));
vi.mock('@/lib/db', () => ({ prisma: { user } }));

import { findOrCreateUserByEmail } from '@/lib/db/orders';

beforeEach(() => {
  user.findUnique.mockReset();
  user.create.mockClear();
  user.update.mockClear();
});

describe('findOrCreateUserByEmail', () => {
  it('nouveau compte → create avec name composé', async () => {
    user.findUnique.mockResolvedValue(null);
    await findOrCreateUserByEmail({ email: 'New@Plio.CA', firstName: 'Léa', lastName: 'Roy', phone: '5145551234' });
    expect(user.create).toHaveBeenCalledOnce();
    const data = user.create.mock.calls[0]![0].data;
    expect(data.email).toBe('new@plio.ca'); // normalisé
    expect(data.name).toBe('Léa Roy');
  });

  it('compte existant avec prénom DÉJÀ rempli → NON écrasé par le contact', async () => {
    user.findUnique.mockResolvedValue({ id: 'u1', firstName: 'Sophie', lastName: 'Beauchamp', phone: '5141112222' });
    await findOrCreateUserByEmail({ email: 'x@plio.ca', firstName: 'Destinataire', lastName: 'Autre', phone: '5149998888' });
    expect(user.update).toHaveBeenCalledOnce();
    const data = user.update.mock.calls[0]![0].data;
    expect(data.firstName).toBe('Sophie'); // conservé, pas écrasé
    expect(data.lastName).toBe('Beauchamp');
    expect(data.phone).toBe('5141112222');
    expect(data.name).toBe('Sophie Beauchamp'); // recalculé depuis les valeurs finales
  });

  it('compte existant avec champ MANQUANT → rempli depuis le contact + name recalculé', async () => {
    user.findUnique.mockResolvedValue({ id: 'u2', firstName: null, lastName: null, phone: null });
    await findOrCreateUserByEmail({ email: 'y@plio.ca', firstName: 'Nouveau', lastName: 'Nom', phone: '5140000000' });
    const data = user.update.mock.calls[0]![0].data;
    expect(data.firstName).toBe('Nouveau');
    expect(data.name).toBe('Nouveau Nom'); // plus de name périmé
  });
});
