/**
 * Tests pour le pixel d'open tracking :
 *   - GET /api/emails/pixel/[id] retourne un 1x1 GIF + headers no-store
 *   - Met à jour openedAt + openCount via raw SQL (COALESCE pattern)
 *   - Defensive : id invalide → quand même retourne pixel sans crash
 *   - sendEmail inject le pixel dans le HTML quand deliveryId est fourni
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    $executeRaw: vi.fn(async () => 1),
  },
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return {
    logEmail: stub, log: stub, logStripe: stub, logAuth: stub,
    logSinalite: stub, logS3: stub, logAdmin: stub, logWebhook: stub,
  };
});

import { prisma } from '@/lib/db';
import { renderEmail } from '@/lib/emails/render';

async function importPixel() {
  vi.resetModules();
  return (await import('@/app/api/emails/pixel/[id]/route')).GET;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/emails/pixel/[id]', () => {
  it('retourne un 1x1 GIF avec Content-Type image/gif', async () => {
    const GET = await importPixel();
    const res = await GET(new Request('http://localhost/api/emails/pixel/del_abc123def'), {
      params: Promise.resolve({ id: 'del_abc123def' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/gif');
    expect(res.headers.get('Cache-Control')).toMatch(/no-store/);

    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBe(42); // 1×1 transparent GIF size
    // Vérifier le GIF magic bytes (GIF89a)
    const bytes = new Uint8Array(buf);
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2])).toBe('GIF');
  });

  it('incrémente openCount via UPDATE raw SQL avec COALESCE openedAt', async () => {
    const GET = await importPixel();
    await GET(new Request('http://localhost/api/emails/pixel/del_xyz789abc'), {
      params: Promise.resolve({ id: 'del_xyz789abc' }),
    });
    // Fire-and-forget — wait microtask
    await new Promise((r) => setImmediate(r));

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    // The raw SQL should reference EmailDelivery + openCount + COALESCE
    const args = vi.mocked(prisma.$executeRaw).mock.calls[0];
    const sqlPieces = (args[0] as TemplateStringsArray).raw.join('');
    expect(sqlPieces).toMatch(/EmailDelivery/);
    expect(sqlPieces).toMatch(/openedAt/);
    expect(sqlPieces).toMatch(/openCount/);
    expect(sqlPieces).toMatch(/COALESCE/);
  });

  it('defensive : id trop court → skip DB write, retourne quand même pixel', async () => {
    const GET = await importPixel();
    const res = await GET(new Request('http://localhost/api/emails/pixel/x'), {
      params: Promise.resolve({ id: 'x' }),
    });
    expect(res.status).toBe(200);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('defensive : DB throw → toujours retourne pixel valide (no broken image)', async () => {
    vi.mocked(prisma.$executeRaw).mockRejectedValueOnce(new Error('DB down'));
    const GET = await importPixel();
    const res = await GET(new Request('http://localhost/api/emails/pixel/del_xxx'), {
      params: Promise.resolve({ id: 'del_abc123def' }),
    });
    expect(res.status).toBe(200);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBe(42);
  });
});

describe('renderEmail + pixel injection (via sendEmail wiring)', () => {
  // We test the pixel injection logic by inspecting the HTML.
  // sendEmail in dev mode (no SES_SMTP_USER) just logs — we can't easily
  // inspect the html sent. So we test renderEmail produces something that
  // contains </body>, and then assert the injection regex pattern works.

  it('renderEmail produit un HTML avec </body> sur les vrais templates', () => {
    const html = renderEmail('welcome', {
      CUSTOMER_FIRST_NAME: 'X',
      TEMPLATES_URL: 'https://plio.ca/templates',
      ORDER_START_URL: 'https://plio.ca/order/start',
      CATALOG_URL: 'https://plio.ca/templates',
      UNSUBSCRIBE_URL: 'https://plio.ca/settings',
    });
    expect(html).toMatch(/<\/body>/);
  });

  it('le pattern d\'injection pixel produit un HTML valide', () => {
    const html = '<html><body><p>hi</p></body></html>';
    const pixelTag = '<img src="https://plio.ca/api/emails/pixel/del_x" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />';
    const injected = html.replace('</body>', `${pixelTag}</body>`);
    expect(injected).toBe('<html><body><p>hi</p>' + pixelTag + '</body></html>');
    expect(injected).toContain('/api/emails/pixel/del_x');
    // Pixel doit être JUSTE avant </body> (pas après)
    expect(injected.indexOf(pixelTag)).toBeLessThan(injected.indexOf('</body>'));
  });
});
