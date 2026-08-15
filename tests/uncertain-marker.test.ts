/**
 * « Sait-on déjà le numéro fournisseur ? » — la question qui sépare deux
 * situations que l'encadré admin confondait.
 *
 * Quand le fournisseur a RÉPONDU et que seul notre enregistrement a échoué, la
 * production est lancée, c'est certain, et le numéro est dans la timeline.
 * L'encadré affichait pourtant « la commande existe PEUT-ÊTRE » et envoyait
 * l'admin fouiller le portail pour un chiffre qu'on avait sous la main — en
 * lui proposant au passage « Annuler », c'est-à-dire rembourser une impression
 * réelle.
 */
import { describe, it, expect } from 'vitest';
import { numeroFournisseurConnu, enAttenteDeTranchage } from '@/lib/orders/uncertain-marker';

const ev = (data: unknown, min: number, kind = 'SINALITE_SUBMIT_UNCERTAIN') => ({
  kind,
  data: data === null ? null : JSON.stringify(data),
  createdAt: new Date(2026, 0, 1, 0, min),
});

describe('numéro connu malgré l’absence de sinaliteOrderId', () => {
  it('le lit dans l’événement de la branche « soumis, enregistrement échoué »', () => {
    expect(numeroFournisseurConnu([ev({ sinaliteOrderId: 481203, rattache: false }, 0)])).toBe(481203);
  });

  it('rend null quand l’issue est RÉELLEMENT inconnue', () => {
    // L'événement de cette branche ne porte pas de numéro, à dessein.
    expect(numeroFournisseurConnu([ev({ raison: 'TimeoutError' }, 0)])).toBeNull();
  });

  it('⚠️ un rejeu ultérieur SANS numéro n’efface pas ce qu’on avait appris', () => {
    // Le piège : prendre « le plus récent » tout court. On veut le plus récent
    // QUI PORTE un numéro — la production reste lancée.
    expect(numeroFournisseurConnu([
      ev({ raison: 'TimeoutError' }, 10),
      ev({ sinaliteOrderId: 481203 }, 5),
    ])).toBe(481203);
  });

  it('deux numéros → le plus RÉCENT, quel que soit l’ordre du tableau', () => {
    expect(numeroFournisseurConnu([
      ev({ sinaliteOrderId: 111 }, 1),
      ev({ sinaliteOrderId: 999 }, 20),
      ev({ sinaliteOrderId: 222 }, 3),
    ])).toBe(999);
  });

  it.each([
    ['autre kind', [ev({ sinaliteOrderId: 481203 }, 0, 'SINALITE_SUBMITTED')]],
    ['data null', [ev(null, 0)]],
    ['JSON invalide', [{ kind: 'SINALITE_SUBMIT_UNCERTAIN', data: '{cassé', createdAt: new Date() }]],
    ['zéro', [ev({ sinaliteOrderId: 0 }, 0)]],
    ['négatif', [ev({ sinaliteOrderId: -1 }, 0)]],
    ['décimal', [ev({ sinaliteOrderId: 1.5 }, 0)]],
    ['texte', [ev({ sinaliteOrderId: 'abc' }, 0)]],
    ['aucun événement', []],
  ])('%s → null', (_label, evenements) => {
    expect(numeroFournisseurConnu(evenements)).toBeNull();
  });

  it('accepte un numéro sérialisé en chaîne', () => {
    expect(numeroFournisseurConnu([ev({ sinaliteOrderId: '481203' }, 0)])).toBe(481203);
  });
});

describe('une levée efface ce qu’on savait de l’épisode PRÉCÉDENT', () => {
  const leve = (min: number) => ({
    kind: 'SINALITE_SUBMIT_UNCERTAIN_CLEARED',
    data: JSON.stringify({ adminEmail: 'a@plio.ca' }),
    createdAt: new Date(2026, 0, 1, 0, min),
  });

  it('épisode A avec numéro → levée → épisode B inconnu ⇒ null', () => {
    // Sinon la fiche affiche « Production LANCÉE #481203 » pour un épisode B
    // dont on ne sait rien : elle affirme plus qu'elle ne sait, exactement le
    // défaut que ce lot corrige ailleurs.
    expect(numeroFournisseurConnu([
      ev({ sinaliteOrderId: 481203 }, 5),
      leve(10),
      ev({ raison: 'TimeoutError' }, 15),
    ])).toBeNull();
  });

  it('un numéro appris APRÈS la levée compte toujours', () => {
    expect(numeroFournisseurConnu([
      ev({ sinaliteOrderId: 111 }, 5),
      leve(10),
      ev({ sinaliteOrderId: 999 }, 15),
    ])).toBe(999);
  });

  it('sans aucune levée, rien ne change', () => {
    expect(numeroFournisseurConnu([ev({ sinaliteOrderId: 481203 }, 5)])).toBe(481203);
  });
});

describe('enAttenteDeTranchage — la question que quatre routes doivent poser', () => {
  it('marqueur posé et aucun numéro rattaché → true', () => {
    expect(enAttenteDeTranchage({ sinaliteSubmitUncertainAt: new Date(), sinaliteOrderId: null })).toBe(true);
  });

  it('numéro rattaché → false, même si le marqueur traîne', () => {
    // Dès qu'un numéro existe, la commande est réellement en production et son
    // statut dit vrai : la bloquer n'aurait plus de sens.
    expect(enAttenteDeTranchage({ sinaliteSubmitUncertainAt: new Date(), sinaliteOrderId: '481203' })).toBe(false);
  });

  it('aucun marqueur → false', () => {
    expect(enAttenteDeTranchage({ sinaliteSubmitUncertainAt: null, sinaliteOrderId: null })).toBe(false);
  });
});
