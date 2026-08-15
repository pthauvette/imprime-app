/**
 * Tests GET /api/cron/order-sla-alerts — Round 34.
 *
 * Lock-in :
 *   - 401 si Bearer manquant en prod
 *   - skip si ADMIN_EMAILS missing
 *   - findMany filter status IN [PAID, SUBMITTED] + paidAt < cutoff(-48h)
 *   - 200 + skip email si zero stuck
 *   - 200 + email envoyé par recipient + BODY_HTML inclut chaque order
 *   - fail-soft per-recipient
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    order: {
      findMany: vi.fn(),
      // Round 39 #5 : bump slaAlertedAt après send réussi
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

vi.mock('@/lib/cron/healthcheck', () => ({ pingCronHealthcheck: vi.fn() }));
vi.mock('@/lib/cron/runs', () => ({ recordCronRun: vi.fn() }));
vi.mock('@/lib/emails/send', () => ({
  sendAdminCustomMessageEmail: vi.fn(async () => ({ sent: true, id: 'em_1' })),
}));
vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { log: { info: noop, warn: noop, error: noop, fatal: noop, debug: noop } };
});

import { prisma } from '@/lib/db';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';

function makeReq(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new Request('http://localhost/api/cron/order-sla-alerts', { headers });
}

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  vi.resetAllMocks();
  process.env = {
    ...ORIG_ENV,
    CRON_SECRET: 'test_secret',
    NODE_ENV: 'production',
    ADMIN_EMAILS: 'a1@plio.ca, a2@plio.ca',
  };
  vi.mocked(prisma.order.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(sendAdminCustomMessageEmail).mockResolvedValue({ sent: true, id: 'em' } as never);
});

describe('GET /api/cron/order-sla-alerts (Round 34)', () => {
  it('401 si Bearer manquant en prod', async () => {
    const { GET } = await import('@/app/api/cron/order-sla-alerts/route');
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(401);
  });

  it('skip si ADMIN_EMAILS missing', async () => {
    delete process.env.ADMIN_EMAILS;
    const { GET } = await import('@/app/api/cron/order-sla-alerts/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skipped).toBe('admin_emails_not_configured');
    expect(sendAdminCustomMessageEmail).not.toHaveBeenCalled();
  });

  it('where clause : status IN [PAID, SUBMITTED] + paidAt < cutoff(-48h) + dedup OR', async () => {
    const { GET } = await import('@/app/api/cron/order-sla-alerts/route');
    await GET(makeReq('Bearer test_secret') as never);
    const args = vi.mocked(prisma.order.findMany).mock.calls[0]![0];
    expect(args?.where).toMatchObject({
      status: { in: ['PAID', 'SUBMITTED'] },
    });
    const paidAtLt = (args?.where as { paidAt?: { lt: Date } } | undefined)?.paidAt?.lt;
    expect(paidAtLt).toBeInstanceOf(Date);
    const expectedCutoffMs = Date.now() - 48 * 3600 * 1000;
    expect(Math.abs(paidAtLt!.getTime() - expectedCutoffMs)).toBeLessThan(60_000);
    // Round 39 #5 — dedup : OR [slaAlertedAt null, slaAlertedAt < now-7d]
    const orClause = (args?.where as { OR?: unknown[] } | undefined)?.OR;
    expect(orClause).toHaveLength(2);
    expect(orClause).toEqual(
      expect.arrayContaining([
        { slaAlertedAt: null },
        expect.objectContaining({ slaAlertedAt: expect.objectContaining({ lt: expect.any(Date) }) }),
      ]),
    );
  });

  it('Round 39 #5 : bump slaAlertedAt sur les orders alertés après send réussi', async () => {
    const oldDate = new Date(Date.now() - 60 * 3600 * 1000);
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        id: 'o_a', status: 'PAID', paidAt: oldDate, amountCents: 100, currency: 'cad',
        shipName: 'A', shipCity: 'M', shipProvince: 'QC', productSummary: 'P',
        slaAlertedAt: null, user: { email: 'u@plio.ca' },
      },
      {
        id: 'o_b', status: 'PAID', paidAt: oldDate, amountCents: 200, currency: 'cad',
        shipName: 'B', shipCity: 'M', shipProvince: 'QC', productSummary: 'P',
        slaAlertedAt: null, user: { email: 'u@plio.ca' },
      },
    ] as never);
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 2 } as never);

    const { GET } = await import('@/app/api/cron/order-sla-alerts/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.dedupBumped).toBe(2);
    expect(prisma.order.updateMany).toHaveBeenCalledTimes(1);
    const args = vi.mocked(prisma.order.updateMany).mock.calls[0]![0];
    expect(args?.where).toEqual({ id: { in: ['o_a', 'o_b'] } });
    expect((args?.data as { slaAlertedAt: Date }).slaAlertedAt).toBeInstanceOf(Date);
  });

  it('Round 39 #5 : NE bump PAS slaAlertedAt si tout les sends fail (retry next cron)', async () => {
    const oldDate = new Date(Date.now() - 60 * 3600 * 1000);
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        id: 'o_x', status: 'PAID', paidAt: oldDate, amountCents: 100, currency: 'cad',
        shipName: 'X', shipCity: 'M', shipProvince: 'QC', productSummary: 'P',
        slaAlertedAt: null, user: { email: 'u@plio.ca' },
      },
    ] as never);
    vi.mocked(sendAdminCustomMessageEmail).mockRejectedValue(new Error('SES bounce'));

    const { GET } = await import('@/app/api/cron/order-sla-alerts/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(json.dedupBumped).toBe(0);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('Round 39 #5 : flag "re-alert" dans le body pour les chroniques (slaAlertedAt set)', async () => {
    const oldDate = new Date(Date.now() - 60 * 3600 * 1000);
    const previouslyAlerted = new Date(Date.now() - 8 * 24 * 3600 * 1000);
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        id: 'o_chronic', status: 'PAID', paidAt: oldDate, amountCents: 100, currency: 'cad',
        shipName: 'X', shipCity: 'M', shipProvince: 'QC', productSummary: 'P',
        slaAlertedAt: previouslyAlerted, user: { email: 'u@plio.ca' },
      },
    ] as never);

    const { GET } = await import('@/app/api/cron/order-sla-alerts/route');
    await GET(makeReq('Bearer test_secret') as never);
    const firstCall = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0]![0];
    expect(firstCall.vars.BODY_HTML).toMatch(/re-alert/i);
  });

  it('200 + zéro stuck → skip email + ping healthcheck OK', async () => {
    const { GET } = await import('@/app/api/cron/order-sla-alerts/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.stuckCount).toBe(0);
    expect(json.sent).toBe(0);
    expect(sendAdminCustomMessageEmail).not.toHaveBeenCalled();
  });

  it('200 + envoie email à chaque admin avec liste des stuck orders', async () => {
    const oldDate = new Date(Date.now() - 72 * 3600 * 1000); // 72h ago
    // ⚠️ AIGUILLAGE PAR `where`, pas par ORDRE D'APPEL. Le cron fait maintenant
    // DEUX `findMany` : les commandes bloquées et les soumissions d'issue
    // inconnue. Un `mockResolvedValue` unique rendait la même liste aux deux —
    // la commande bloquée apparaissait donc aussi comme « sans réponse », et
    // l'assertion sur l'objet de l'email échouait pour la bonne raison.
    // `mockResolvedValueOnce` aurait marché mais aurait couplé le test à
    // l'ordre des requêtes dans le code.
    vi.mocked(prisma.order.findMany).mockImplementation((async (args?: { where?: Record<string, unknown> }) => {
      const where = args?.where ?? {};
      if (where.sinaliteSubmitUncertainAt && typeof where.sinaliteSubmitUncertainAt === 'object') {
        return [];
      }
      return [
      {
        id: 'o_stuck_1',
        status: 'PAID',
        paidAt: oldDate,
        amountCents: 12345,
        currency: 'cad',
        shipName: 'Patrick Thauvette',
        shipCity: 'Montreal',
        shipProvince: 'QC',
        productSummary: 'Cartes 14pt (250)',
        user: { email: 'p@plio.ca' },
      },
    ];
    }) as never);

    const { GET } = await import('@/app/api/cron/order-sla-alerts/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.stuckCount).toBe(1);
    expect(json.recipients).toBe(2);
    expect(json.sent).toBe(2);

    const calls = vi.mocked(sendAdminCustomMessageEmail).mock.calls;
    expect(calls).toHaveLength(2);
    const firstArgs = calls[0]![0];
    expect(firstArgs.vars.SUBJECT).toMatch(/1 commande bloquée/);
    expect(firstArgs.vars.BODY_HTML).toMatch(/Patrick Thauvette/);
    expect(firstArgs.vars.BODY_HTML).toMatch(/Cartes 14pt/);
    expect(firstArgs.vars.BODY_HTML).toMatch(/72h/); // age computed
  });

  it('fail-soft per-recipient : 1 send fail ne casse pas l\'autre', async () => {
    const oldDate = new Date(Date.now() - 60 * 3600 * 1000);
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        id: 'o1', status: 'PAID', paidAt: oldDate, amountCents: 1000, currency: 'cad',
        shipName: 'X', shipCity: 'Y', shipProvince: 'QC', productSummary: 'Z',
        user: { email: 'u@plio.ca' },
      },
    ] as never);
    vi.mocked(sendAdminCustomMessageEmail)
      .mockRejectedValueOnce(new Error('SES bounce'))
      .mockResolvedValueOnce({ sent: true, id: 'em_2' } as never);

    const { GET } = await import('@/app/api/cron/order-sla-alerts/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.recipients).toBe(2);
    expect(json.sent).toBe(1); // 1 fail soft, 1 success
  });

  it('500 si findMany throw → recordCronRun fail', async () => {
    vi.mocked(prisma.order.findMany).mockRejectedValueOnce(new Error('DB down'));
    const { GET } = await import('@/app/api/cron/order-sla-alerts/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(500);
  });
});

/**
 * Balayage des soumissions d'issue inconnue.
 *
 * POURQUOI. `sinaliteSubmitUncertainAt` n'était lu QUE sur la fiche d'une
 * commande — donc seulement par un admin qui l'ouvre déjà, pour une raison
 * qu'il ne peut pas avoir. Aucun filtre dans la liste, aucun cron : ce
 * balayage-ci ne prenait que PAID/SUBMITTED, or une commande marquée par le
 * webhook est FAILED. Le seul canal restant était Slack, MUET sans
 * `SLACK_WEBHOOK_URL`. Un marqueur que personne ne voit ne protège de rien.
 */
describe('soumissions d’issue inconnue — balayage sans seuil ni dédup', () => {
  const marquee = {
    id: 'ord_abcdef123456',
    status: 'FAILED',
    paidAt: new Date(Date.now() - 3 * 3600 * 1000),
    amountCents: 8900,
    currency: 'cad',
    sinaliteSubmitUncertainAt: new Date(Date.now() - 3 * 3600 * 1000),
    failureReason: 'issue INCONNUE',
    user: { email: 'client@exemple.ca' },
  };

  /** Aiguillage par `where` : le cron fait deux `findMany` distincts. */
  function router(stuck: unknown[], incertaines: unknown[]) {
    vi.mocked(prisma.order.findMany).mockImplementation((async (args?: { where?: Record<string, unknown> }) => {
      const where = args?.where ?? {};
      return where.sinaliteSubmitUncertainAt && typeof where.sinaliteSubmitUncertainAt === 'object'
        ? incertaines
        : stuck;
    }) as never);
  }

  it('une commande FAILED marquée est relevée, alors qu’aucun statut ne la balaie', async () => {
    router([], [marquee]);
    const { GET } = await import('@/app/api/cron/order-sla-alerts/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();

    expect(json.incertainesCount).toBe(1);
    expect(json.sent).toBe(2);
    const vars = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0]![0].vars;
    // L'objet doit porter le cas urgent : sous « N commandes bloquées », une
    // soumission sans réponse se lit comme de la routine.
    expect(vars.SUBJECT).toMatch(/SANS RÉPONSE/);
    // La clé de corrélation citable au portail, sinon on demande une
    // vérification en retenant ce qui permet de la faire.
    expect(vars.BODY_HTML).toContain('PLIO-123456');
    expect(vars.BODY_HTML).toMatch(/apifrontend\.sinaliteuppy\.com/);
  });

  it('zéro bloquée + une marquée → l’email part quand même', async () => {
    // Le premier jet sortait tôt sur `stuckOrders.length === 0` : le cas le
    // plus urgent était précisément celui qui ne déclenchait rien.
    router([], [marquee]);
    const { GET } = await import('@/app/api/cron/order-sla-alerts/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect((await res.json()).sent).toBe(2);
  });

  it('la requête exclut les envois ENCORE EN VOL et les commandes déjà rattachées', async () => {
    router([], []);
    const { GET } = await import('@/app/api/cron/order-sla-alerts/route');
    await GET(makeReq('Bearer test_secret') as never);
    const where = vi.mocked(prisma.order.findMany).mock.calls
      .map((c) => c[0]?.where as Record<string, unknown>)
      .find((w) => w?.sinaliteSubmitUncertainAt && typeof w.sinaliteSubmitUncertainAt === 'object')!;

    // `sinaliteOrderId: null` : une commande dont le numéro a fini par être
    // rattaché n'est plus incertaine.
    expect(where.sinaliteOrderId).toBeNull();
    // `lt` : pendant la péremption du verrou, l'envoi peut encore aboutir seul.
    // Alerter là-dessus serait un faux positif à chaque déploiement malchanceux.
    expect((where.sinaliteSubmitUncertainAt as { not: unknown; lt: Date }).lt).toBeInstanceOf(Date);
    expect((where.sinaliteSubmitUncertainAt as { not: unknown }).not).toBeNull();
    // AUCUN filtre de dédup : le marqueur doit revenir chaque jour.
    expect(where.slaAlertedAt).toBeUndefined();
    expect(where.OR).toBeUndefined();
  });

  it('les commandes marquées sont EXCLUES du bloc SLA (pas de doublon)', async () => {
    router([], []);
    const { GET } = await import('@/app/api/cron/order-sla-alerts/route');
    await GET(makeReq('Bearer test_secret') as never);
    const whereSla = vi.mocked(prisma.order.findMany).mock.calls
      .map((c) => c[0]?.where as Record<string, unknown>)
      .find((w) => Array.isArray((w?.status as { in?: unknown[] })?.in))!;
    expect(whereSla.sinaliteSubmitUncertainAt).toBeNull();
  });
});
