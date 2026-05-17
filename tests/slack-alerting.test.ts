/**
 * Tests pour sendCriticalAlert — best-effort wrapper autour de Slack
 * incoming webhooks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub global fetch — Slack webhook = POST JSON.
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function importFresh() {
  vi.resetModules();
  const mod = await import('@/lib/alerting/slack');
  return mod.sendCriticalAlert;
}

describe('sendCriticalAlert', () => {
  it('return false si SLACK_WEBHOOK_URL absent (no-op)', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', '');
    const send = await importFresh();
    const r = await send({ severity: 'critical', title: 'X', body: 'Y' });
    expect(r).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('return false en dev par défaut (skip pour pas spammer)', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/AAA/BBB/CCC');
    vi.stubEnv('NODE_ENV', 'development');
    const send = await importFresh();
    const r = await send({ severity: 'critical', title: 'X', body: 'Y' });
    expect(r).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envoie en dev si SLACK_ALERTS_IN_DEV=1 (override)', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/AAA/BBB/CCC');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SLACK_ALERTS_IN_DEV', '1');
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const send = await importFresh();
    const r = await send({ severity: 'critical', title: 'X', body: 'Y' });
    expect(r).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('POST le payload Slack avec emoji + color selon severity', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/AAA/BBB/CCC');
    vi.stubEnv('NODE_ENV', 'production');
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const send = await importFresh();
    await send({
      severity: 'critical',
      title: 'Refund failed',
      body: 'Need manual intervention',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('https://hooks.slack.com/services/AAA/BBB/CCC');
    const body = JSON.parse(call[1].body as string);
    expect(body.text).toContain('🚨');
    expect(body.text).toContain('Refund failed');
    expect(body.attachments[0].color).toBe('#B83A2C'); // rouge critical
    expect(body.attachments[0].blocks[0].text.text).toContain('Refund failed');
  });

  it('warning utilise emoji + color différents', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/x');
    vi.stubEnv('NODE_ENV', 'production');
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const send = await importFresh();
    await send({ severity: 'warning', title: 'Heads up', body: 'Y' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.text).toContain('⚠️');
    expect(body.attachments[0].color).toBe('#D97706'); // orange warning
  });

  it('inclut le context comme JSON block', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/x');
    vi.stubEnv('NODE_ENV', 'production');
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const send = await importFresh();
    await send({
      severity: 'critical',
      title: 'X',
      body: 'Y',
      context: { orderId: 'ord_abc', amountCents: 12345 },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const blocks = body.attachments[0].blocks;
    const contextBlock = blocks.find((b: { text?: { text: string } }) => b.text?.text.includes('```'));
    expect(contextBlock).toBeDefined();
    expect(contextBlock.text.text).toContain('ord_abc');
    expect(contextBlock.text.text).toContain('12345');
  });

  it('actionUrl absolue passe direct, relative est préfixée par APP_URL', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/x');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://plio.ca');
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const send = await importFresh();
    await send({
      severity: 'critical',
      title: 'X',
      body: 'Y',
      actionUrl: '/admin/orders/ord_x',
      actionLabel: 'Ouvrir',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const actionBlock = body.attachments[0].blocks.find(
      (b: { type: string }) => b.type === 'actions',
    );
    expect(actionBlock.elements[0].url).toBe('https://plio.ca/admin/orders/ord_x');
    expect(actionBlock.elements[0].text.text).toBe('Ouvrir');
  });

  it('NE THROW JAMAIS même si fetch fail', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/x');
    vi.stubEnv('NODE_ENV', 'production');
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const send = await importFresh();
    // Si throw, vitest catch
    const r = await send({ severity: 'critical', title: 'X', body: 'Y' });
    expect(r).toBe(false);
  });

  it('return false si Slack répond non-OK (400/500)', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/x');
    vi.stubEnv('NODE_ENV', 'production');
    fetchMock.mockResolvedValueOnce(new Response('invalid_payload', { status: 400 }));
    const send = await importFresh();
    const r = await send({ severity: 'critical', title: 'X', body: 'Y' });
    expect(r).toBe(false);
  });

  it('tronque le context si trop gros (limite Slack 3000 chars block)', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/x');
    vi.stubEnv('NODE_ENV', 'production');
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const send = await importFresh();
    const huge = { data: 'x'.repeat(5000) };
    await send({ severity: 'critical', title: 'X', body: 'Y', context: huge });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const blocks = body.attachments[0].blocks;
    const contextBlock = blocks.find((b: { text?: { text: string } }) => b.text?.text.includes('```'));
    // Le text du block ne doit pas dépasser ~3000 chars (Slack limit per block)
    expect(contextBlock.text.text.length).toBeLessThan(3100);
  });
});
