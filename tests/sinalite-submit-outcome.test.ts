/**
 * « Le fournisseur a-t-il PU créer la commande ? » — la question dont la
 * réponse décide d'un remboursement automatique.
 *
 * POURQUOI CE FICHIER. Les deux chemins de soumission (webhook Stripe et rejeu
 * admin) lisent maintenant CE prédicat. Se tromper coûte de l'argent dans les
 * deux sens :
 *   - faux positif (« rien créé » alors que si) → on rembourse une commande en
 *     production, ou on relance et l'imprimeur produit deux fois ;
 *   - faux négatif (« peut-être créé » alors que non) → quelques minutes
 *     d'attente et un geste humain.
 * L'asymétrie est totale, donc le prédicat n'affirme QUE sur preuve.
 */
import { describe, it, expect } from 'vitest';
import { SinaliteError } from '@/lib/sinalite/client';
import { aucuneCreationPossible, REFUS_AVANT_CREATION } from '@/lib/sinalite/submit-outcome';

describe('preuves POSITIVES qu’aucune commande n’a été créée', () => {
  it.each([
    ['/auth/token', 401, 'identifiants fournisseur rejetés'],
    ['/auth/token', 0, 'délai d’attente ou DNS sur le jeton'],
    ['<config>', 0, 'configuration invalide'],
    ['<payload>', 0, 'validation locale du payload'],
  ])('%s (%i) → %s', (endpoint, status) => {
    // `request()` appelle `getToken()` AVANT son fetch : tout ce qui porte un
    // endpoint autre que `/order/new` est survenu avant le moindre paquet.
    expect(aucuneCreationPossible(new SinaliteError('x', status as number, endpoint as string))).toBe(true);
  });

  it.each(REFUS_AVANT_CREATION)('/order/new refusé en %i → refus AVANT création', (status) => {
    expect(aucuneCreationPossible(new SinaliteError('refus', status, '/order/new'))).toBe(true);
  });
});

describe('tout le reste est INCONNU — y compris des succès apparents', () => {
  it('409 « existe déjà » n’est PAS une preuve d’absence', () => {
    // Le mot même du code dit qu'une commande a été créée. Un jet précédent
    // déduisait « rien créé » de toute la plage 4xx : le marqueur était effacé
    // sans alerte et le bouton redevenait cliquable dans la seconde.
    expect(aucuneCreationPossible(new SinaliteError('exists', 409, '/order/new'))).toBe(false);
  });

  it('429 est posable APRÈS traitement de la requête', () => {
    expect(aucuneCreationPossible(new SinaliteError('rate', 429, '/order/new'))).toBe(false);
  });

  it.each([500, 502, 503, 504])('%i → issue inconnue', (status) => {
    expect(aucuneCreationPossible(new SinaliteError('boom', status, '/order/new'))).toBe(false);
  });

  it('⚠️ status 200 sur /order/new = commande CRÉÉE, identifiant perdu', () => {
    // Le piège du fichier. `request()` lève un `SinaliteError` portant le
    // statut HTTP RÉEL quand le schéma de réponse ne colle pas — et `res.ok`
    // était vrai. Traiter « 4xx-et-quelques » comme seule zone dangereuse
    // aurait rangé ce cas du côté « rien créé ».
    expect(aucuneCreationPossible(new SinaliteError('schema mismatch', 200, '/order/new'))).toBe(false);
  });

  it.each([
    ['délai d’attente sur /order/new', new DOMException('The operation was aborted', 'TimeoutError')],
    ['corps tronqué', new SyntaxError('Unexpected end of JSON input')],
    ['erreur générique', new Error('fetch failed')],
    ['objet quelconque', { message: 'pas une Error' }],
    ['null', null],
    ['undefined', undefined],
  ])('%s → inconnu (pas un SinaliteError)', (_label, err) => {
    expect(aucuneCreationPossible(err)).toBe(false);
  });
});

describe('la liste blanche elle-même', () => {
  it('ne contient NI 409 NI 429 — les deux codes qui coûtent une double production', () => {
    expect(REFUS_AVANT_CREATION).not.toContain(409);
    expect(REFUS_AVANT_CREATION).not.toContain(429);
  });

  it('ne contient aucun 5xx ni aucun 2xx', () => {
    expect(REFUS_AVANT_CREATION.every((s) => s >= 400 && s < 500)).toBe(true);
  });
});
