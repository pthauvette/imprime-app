/**
 * Purge S3 — droit à l'effacement (Loi 25 art. 28.1).
 *
 * CONTEXTE (audit pré-lancement 2026-07, P1-1) : `grep DeleteObject` sur tout le
 * dépôt ne renvoyait RIEN. La route de suppression PIPEDA anonymisait 10 tables
 * mais ne touchait jamais S3 — alors que le courriel de confirmation affirme au
 * client « Brouillons + designs → supprimés ». Les PDF restaient `public-read`
 * à une URL toujours valide, indéfiniment. Un design de carte d'affaires
 * contient couramment nom, téléphone et courriel.
 *
 * Le point le plus important testé ici : `s3KeyFromUrl` REFUSE toute URL qui
 * n'est pas un objet de notre bucket sous `uploads/`. On ne supprime jamais sur
 * la foi d'une URL arbitraire lue en base — une valeur corrompue ou injectée ne
 * doit pas pouvoir viser un autre objet.
 */

import { describe, it, expect } from 'vitest';

const BUCKET = 'plio-test-bucket';
const REGION = 'ca-central-1';

// ⚠️ L'env DOIT être posée AVANT l'import : `s3.ts` lit S3_BUCKET/S3_REGION au
// CHARGEMENT du module (`const BUCKET = process.env.S3_BUCKET ?? ''`). Un
// `beforeAll` s'exécuterait trop tard — et avec BUCKET='', s3KeyFromUrl
// retournerait null pour TOUT, donc les cas négatifs passeraient pour la
// mauvaise raison (faux positifs de test).
process.env.S3_BUCKET = BUCKET;
process.env.S3_REGION = REGION;

const { s3KeyFromUrl } = await import('@/lib/storage/s3');

describe('s3KeyFromUrl — extraction sûre de la clé', () => {
  it('extrait la clé d\'une URL de notre bucket', () => {
    const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/uploads/usr_1/abc-front.pdf`;
    expect(s3KeyFromUrl(url)).toBe('uploads/usr_1/abc-front.pdf');
  });

  it('accepte la forme sans région', () => {
    const url = `https://${BUCKET}.s3.amazonaws.com/uploads/usr_1/abc-back.png`;
    expect(s3KeyFromUrl(url)).toBe('uploads/usr_1/abc-back.png');
  });

  it('décode les caractères encodés dans la clé', () => {
    const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/uploads/usr_1/a%20b-front.pdf`;
    expect(s3KeyFromUrl(url)).toBe('uploads/usr_1/a b-front.pdf');
  });

  // ⚠️ Le cœur de la garde : ne JAMAIS supprimer hors de notre périmètre.
  it.each([
    ['https://evil.com/uploads/x.pdf', 'hôte étranger'],
    [`https://autre-bucket.s3.${REGION}.amazonaws.com/uploads/x.pdf`, 'autre bucket'],
    [`https://${BUCKET}.s3.${REGION}.amazonaws.com/backups/db.sql`, 'hors préfixe uploads/'],
    ['pas-une-url', 'URL illisible'],
    ['', 'chaîne vide'],
  ])('refuse %s (%s)', (url) => {
    expect(s3KeyFromUrl(url)).toBeNull();
  });

  it('refuse null/undefined sans lever', () => {
    expect(s3KeyFromUrl(null)).toBeNull();
    expect(s3KeyFromUrl(undefined)).toBeNull();
  });

  // Une traversée de chemin ne doit pas permettre de sortir de `uploads/`.
  it('refuse une tentative de remontée de chemin', () => {
    const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/..%2Fbackups%2Fdb.sql`;
    expect(s3KeyFromUrl(url)).toBeNull();
  });
});
