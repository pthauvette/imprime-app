/**
 * Indirection sur les URL d'artwork remises à Sinalite.
 *
 * ENJEU — une URL d'artwork cassée, c'est une commande PAYÉE et JAMAIS IMPRIMÉE.
 * C'est pourquoi la conversion est FAIL-OPEN (repli sur l'URL directe) et
 * pourquoi le mode par défaut reste `direct` : la bascule doit être vérifiée sur
 * une vraie commande avant d'être générale, rien ne garantissant que le
 * téléchargeur de Sinalite suive les redirections 302.
 *
 * ⚠️ L'env S3 est posée AVANT tout import : `storage/s3.ts` lit BUCKET/REGION à
 * l'IMPORT. Un `beforeAll` arriverait trop tard et ferait passer les cas
 * négatifs pour de mauvaises raisons (piège déjà rencontré sur les tests S3).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

process.env.S3_BUCKET = 'plio-test';
process.env.S3_REGION = 'ca-central-1';
process.env.S3_ACCESS_KEY_ID = 'test-key';
process.env.S3_SECRET_ACCESS_KEY = 'test-secret';
process.env.NEXT_PUBLIC_APP_URL = 'https://www.plio.ca';

// Clé au format EXACT de buildUploadKey : uploads/{owner}/{uuid}-{kind}.{ext}.
// La route valide par ALLOW-LIST de forme, pas par absence de `..` — un
// fixture approximatif serait donc rejeté, à juste titre.
const CLE = 'uploads/u_1/3f2a1c8e-9b4d-4e7a-8c15-6d2e0f7b3a91-front.pdf';
const PUBLIC_URL = `https://plio-test.s3.ca-central-1.amazonaws.com/${CLE}`;

const { toDeliverableUrl, artworkUrlMode, CLE_ARTWORK_VALIDE } = await import('@/lib/storage/artwork-url');

beforeEach(() => {
  delete process.env.ARTWORK_URL_MODE;
});
afterEach(() => {
  delete process.env.ARTWORK_URL_MODE;
  vi.restoreAllMocks();
});

describe('toDeliverableUrl — mode direct (défaut)', () => {
  it("sans variable, le mode est `direct` et l'URL est INCHANGÉE", () => {
    // La garantie qui compte pour un déploiement : poser ce code en production
    // ne change strictement rien tant que l'opérateur n'a pas basculé.
    expect(artworkUrlMode()).toBe('direct');
    expect(toDeliverableUrl(PUBLIC_URL).url).toBe(PUBLIC_URL);
  });

  it('une valeur inconnue retombe sur `direct` (pas de bascule accidentelle)', () => {
    process.env.ARTWORK_URL_MODE = 'PROXYY';
    expect(toDeliverableUrl(PUBLIC_URL).url).toBe(PUBLIC_URL);
  });
});

describe('toDeliverableUrl — mode proxy', () => {
  beforeEach(() => {
    process.env.ARTWORK_URL_MODE = 'proxy';
  });

  it('convertit en URL absolue de notre domaine, clé préservée', () => {
    // Absolue : Sinalite appelle depuis l'extérieur, une URL relative n'aurait
    // aucun sens pour lui.
    expect(toDeliverableUrl(PUBLIC_URL).url).toBe(
      `https://www.plio.ca/api/artwork/${CLE}`,
    );
  });

  it('les `/` de la clé restent des séparateurs de chemin (pas de %2F)', () => {
    const out = toDeliverableUrl(PUBLIC_URL).url;
    expect(out).not.toContain('%2F');
    expect(new URL(out).pathname).toBe(`/api/artwork/${CLE}`);
  });

  it('FAIL-OPEN : une URL étrangère est renvoyée telle quelle', () => {
    // Mieux vaut une URL qu'on ne contrôle pas mais qui FONCTIONNE qu'une URL
    // proxy fabriquée sur une clé qu'on n'a pas su lire — l'échec se paierait
    // en commandes non imprimées.
    const etrangere = 'https://autre-bucket.s3.amazonaws.com/uploads/x.pdf';
    const conv = toDeliverableUrl(etrangere);
    expect(conv.url).toBe(etrangere);
    // …et le motif REMONTE, pour que l'appelant alerte (le repli est invisible
    // dans le résultat : la commande part et s'imprime quand même).
    expect(conv.fallbackReason).toBe('clé S3 non extractible');
  });

  it("FAIL-OPEN : sans base de site configurée, l'URL directe est conservée", async () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const conv = toDeliverableUrl(PUBLIC_URL);
    expect(conv.url).toBe(PUBLIC_URL);
    expect(conv.fallbackReason).toContain('NEXT_PUBLIC_APP_URL');
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });
});

/**
 * Le bloquant du round 2 : la conversion et la route avaient DEUX définitions
 * de « clé valide ». `s3KeyFromUrl` ne teste que le préfixe `uploads/`, la route
 * exige la forme exacte. Une clé entre les deux était convertie SANS
 * `fallbackReason` — donc sans alerte — et la route la rendait en 404 : commande
 * payée, jamais imprimée, en silence. Ces tests verrouillent l'accord.
 */
describe('accord conversion ↔ route (source unique de vérité)', () => {
  beforeEach(() => {
    process.env.ARTWORK_URL_MODE = 'proxy';
  });

  const HORS_FORME = [
    'uploads/u_1/pas-un-uuid-front.pdf',
    `uploads/u_1/${'3f2a1c8e-9b4d-4e7a-8c15-6d2e0f7b3a91'}-front.PDF`,
    'uploads/u_1/sous/dossier/3f2a1c8e-9b4d-4e7a-8c15-6d2e0f7b3a91-front.pdf',
    'uploads/whatever',
  ];

  it.each(HORS_FORME)('« %s » → repli BRUYANT, jamais une URL proxy morte', (cle) => {
    // Le chemin web valide `files[].url` par un simple z.string().url() : la
    // valeur est client-contrôlée. Une clé forgée hors forme doit produire un
    // repli signalé, pas une URL proxy que la route refusera.
    const conv = toDeliverableUrl(`https://plio-test.s3.ca-central-1.amazonaws.com/${cle}`);
    expect(conv.fallbackReason).not.toBeNull();
    // Et l'URL renvoyée reste FONCTIONNELLE (directe), pas une proxy morte.
    expect(conv.url).not.toContain('/api/artwork/');
  });

  it('toute clé acceptée par la conversion est acceptée par la route', () => {
    // La garantie structurelle : les deux côtés partagent CLE_ARTWORK_VALIDE.
    const conv = toDeliverableUrl(PUBLIC_URL);
    expect(conv.fallbackReason).toBeNull();
    expect(CLE_ARTWORK_VALIDE.test(CLE)).toBe(true);
  });
});

describe('GET /api/artwork/[...key]', () => {
  it('refuse une clé hors du préfixe uploads/ (404 muet)', async () => {
    const { GET } = await import('@/app/api/artwork/[...key]/route');
    const res = await GET(new Request('http://x/api/artwork/etc/passwd'), {
      params: Promise.resolve({ key: ['etc', 'passwd'] }),
    });
    // 404 et non 403 : ne pas renseigner sur ce qui existe.
    expect(res.status).toBe(404);
  });

  it("ATTAQUE — traversée de chemin encodée : ne doit JAMAIS signer hors uploads/", async () => {
    // Faille RÉELLE, reproduite par la revue adversariale sur la 1re version :
    // le garde testait les segments AVANT décodage et la clé était bâtie APRÈS,
    // donc `%2e%2e` passait. Le SDK AWS normalise ensuite le chemin →
    // `uploads/%2e%2e/%2e%2e/factures/x.pdf` signait `/factures/x.pdf`, soit
    // n'importe quel objet du bucket, sans authentification.
    const { S3Client } = await import('@aws-sdk/client-s3');
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const { GET } = await import('@/app/api/artwork/[...key]/route');

    const charges = [
      ['uploads', '%2e%2e', '%2e%2e', 'factures', 'secret.pdf'],
      ['uploads', '..', '..', 'backups', 'db.sql'],
      ['uploads', '%252e%252e', 'exports', 'clients.csv'],
      ['uploads', 'u_1', '3f2a1c8e-9b4d-4e7a-8c15-6d2e0f7b3a91-front.pdf%00.txt'],
      ['exports', 'clients.csv'],
    ];

    for (const key of charges) {
      const res = await GET(new Request('http://x'), { params: Promise.resolve({ key }) });
      expect(res.status, `« ${key.join('/')} » n'a pas été refusée`).toBe(404);
    }
    // Rien n'a même atteint S3 : le refus est en amont du HEAD.
    expect(send).not.toHaveBeenCalled();
  });

  it('la clé S3 n’est JAMAIS passée en clair au rate-limiter', async () => {
    // `makeLimiter` pose `analytics: true`, et @upstash/ratelimit persiste
    // l'identifiant BRUT pour son tableau de bord. Or cette clé EST le secret
    // qui protège des fichiers à PII (storage/s3.ts : « la sécurité repose
    // ENTIÈREMENT sur l'imprévisibilité de la clé »), et son segment `owner`
    // porte un userId. La passer en clair la recopierait chez un tiers.
    const { S3Client } = await import('@aws-sdk/client-s3');
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const rl = await import('@/lib/ratelimit');
    const spy = vi.spyOn(rl, 'rateLimit').mockResolvedValue({ ok: true, remaining: 9 } as never);

    const { GET } = await import('@/app/api/artwork/[...key]/route');
    await GET(new Request('http://x'), { params: Promise.resolve({ key: CLE.split('/') }) });

    const identifiants = spy.mock.calls.map((c) => String(c[1]));
    for (const id of identifiants) {
      expect(id).not.toContain(CLE);
      expect(id).not.toContain('u_1');       // le userId ne doit pas fuiter
      expect(id).not.toContain('3f2a1c8e');  // ni l'UUID, qui EST le secret
    }
    // Et la borne agrégée est bien consultée (convention maison *Global).
    expect(spy.mock.calls.map((c) => c[0])).toContain('artworkGlobal');
  });

  it("un objet supprimé rend l'URL MORTE (404) — la purge PIPEDA devient effective", async () => {
    // C'est la propriété que le bucket public-read ne pouvait pas offrir :
    // l'URL restait valide indéfiniment, même après « suppression ».
    // On simule UNIQUEMENT l'appel réseau (HeadObject) : le client reste réel,
    // car getSignedUrl a besoin d'une vraie pile de middleware pour signer.
    const { S3Client } = await import('@aws-sdk/client-s3');
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('NotFound') as never);

    const { GET } = await import('@/app/api/artwork/[...key]/route');
    const res = await GET(new Request('http://x'), {
      params: Promise.resolve({ key: CLE.split('/') }),
    });
    expect(res.status).toBe(404);
  });

  it('objet présent → 302 vers une URL signée, jamais les octets', async () => {
    // REDIRECTION et non streaming : les fichiers pèsent 20-100 Mo et ne
    // doivent JAMAIS traverser Lambda. La signature est calculée localement
    // (aucun appel réseau), donc des identifiants factices suffisent.
    const { S3Client } = await import('@aws-sdk/client-s3');
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({ ContentLength: 42 } as never);

    const { GET } = await import('@/app/api/artwork/[...key]/route');
    const res = await GET(new Request('http://x'), {
      params: Promise.resolve({ key: CLE.split('/') }),
    });

    expect(res.status).toBe(302);
    const cible = res.headers.get('location') ?? '';
    expect(cible).toContain('X-Amz-Signature');
    expect(cible).toContain(CLE);
    // La redirection ne doit pas être mise en cache : la cible expire.
    expect(res.headers.get('cache-control')).toContain('no-store');
  });
});
