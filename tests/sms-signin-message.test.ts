/**
 * Le message d'échec de la connexion par texto.
 *
 * POURQUOI CE FICHIER. Signalé en production sur un vrai numéro canadien : le
 * texto arrive, le code est bon, et l'écran répond « Code invalide ou expiré ».
 *
 * Ce n'était pas une panne — c'est le comportement voulu. `connexionParSms`
 * envoie un code à TOUT numéro canadien valide (sinon l'endpoint devient un
 * oracle « ce numéro a-t-il un compte chez Plio ? »), Twilio valide le code,
 * puis on cherche un compte dont le `phoneVerified` correspond. Aucun compte →
 * refus. La connexion par texto ne CRÉE jamais de compte.
 *
 * Le défaut était donc le MESSAGE, pas le mécanisme : il affirmait une chose
 * fausse dans le troisième cas. L'utilisateur revérifie ses chiffres, redemande
 * un code, recommence — et rien ne peut marcher tant qu'il ignore la vraie
 * cause.
 *
 * DEUX PROPRIÉTÉS À TENIR ENSEMBLE, et c'est tout l'intérêt :
 *   1. le message ne doit désigner AUCUNE des trois causes (anti-énumération) ;
 *   2. il doit rester VRAI pour les trois, et nommer l'action qui débloque.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', 'src');
const signin = readFileSync(join(SRC, 'components', 'auth', 'SignInSms.tsx'), 'utf8');
const logique = readFileSync(join(SRC, 'lib', 'auth', 'sms-signin.ts'), 'utf8');

/**
 * Le texte réellement affiché quand la VÉRIFICATION échoue (hors commentaires).
 *
 * ⚠️ Ciblé sur le bloc `if (res?.error)` et non sur le premier `setErreur` du
 * fichier : il y en a six, dont « Vérifie ton accès internet » — mon premier
 * jet assertait sur celui-là et échouait en accusant le bon message.
 */
const sansCommentaires = signin.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const message = (() => {
  const bloc = sansCommentaires.match(/if \(res\?\.error\)\s*\{([\s\S]*?)\n\s*\}/);
  expect(bloc, 'bloc if (res?.error) introuvable').toBeTruthy();
  const m = bloc![1]!.match(/setErreur\(\s*((?:'[^']*'[\s+]*)+)/);
  expect(m, 'message de setErreur introuvable dans le bloc').toBeTruthy();
  return [...m![1]!.matchAll(/'([^']*)'/g)].map((x) => x[1]).join('');
})();

describe('le message reste vrai dans les trois cas', () => {
  it("n'affirme plus que le code est invalide", () => {
    // C'était faux quand Twilio venait de le valider.
    expect(message).not.toMatch(/^Code invalide/);
  });

  it('mentionne le rattachement du numéro comme cause possible', () => {
    expect(message).toMatch(/rattach/i);
  });

  it("nomme l'action qui débloque", () => {
    // Un message honnête mais sans issue laisse l'utilisateur au même point.
    expect(message).toMatch(/courriel/i);
  });
});

describe("il ne désigne aucune cause — pas d'oracle", () => {
  it('emploie « peut » plutôt qu’une affirmation', () => {
    // « ce numéro n'a pas de compte » serait un test d'existence gratuit.
    expect(message).toMatch(/peut/i);
  });

  it("n'affirme jamais qu'un compte est absent", () => {
    expect(message).not.toMatch(/aucun compte|n'existe pas|introuvable/i);
  });

  it('reste UNIQUE — un seul message pour tous les échecs', () => {
    // Deux messages distincts sur ce chemin recréeraient la distinction que
    // l'anti-énumération interdit.
    const occurrences = [...sansCommentaires.matchAll(/if \(res\?\.error\)/g)].length;
    expect(occurrences).toBe(1);
  });
});

describe('la logique serveur ne distingue toujours rien', () => {
  it('tous les échecs renvoient null', () => {
    expect(logique).toMatch(/Tous les échecs renvoient `null`/);
  });

  it('la connexion ne crée JAMAIS de compte', () => {
    expect(logique).toMatch(/ne crée JAMAIS de compte/i);
    expect(logique).not.toMatch(/user\.create|prisma\.user\.upsert/);
  });

  it('identité = phoneVerified, jamais phone', () => {
    // `phone` est saisi librement au checkout : s'en servir comme identité
    // laisserait ouvrir le compte d'autrui.
    expect(logique).toMatch(/where:\s*\{\s*phoneVerified:/);
  });
});
