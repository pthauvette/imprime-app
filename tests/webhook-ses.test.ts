/**
 * Tests POST /api/webhooks/ses — Round 39 #4.
 *
 * Lock-in :
 *  - Invalid JSON / missing fields → 400
 *  - SubscriptionConfirmation → fetch SubscribeURL
 *  - Notification + Bounce Permanent → suppressEmail HARD_BOUNCE
 *  - Notification + Bounce Transient → log only, NO suppress
 *  - Notification + Complaint → suppressEmail COMPLAINT
 *  - Dedup sur SNS MessageId (idempotent SNS replay)
 *  - TopicArn allowlist via SES_SNS_TOPIC_ARN env
 *
 * Signature verify est skipped via OD_SKIP_SNS_VERIFY=1 dans les tests
 * (sinon il faudrait mock le fetch du cert RSA + signer le payload).
 * Le verifier lui-même est testé séparément dans sns-verify.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { log: { info: noop, warn: noop, error: noop, fatal: noop, debug: noop } };
});
vi.mock('@/lib/db/orders', () => ({
  recordWebhookEvent: vi.fn(async () => ({ isNew: true })),
  updateWebhookOutcome: vi.fn(async () => undefined),
}));
vi.mock('@/lib/emails/suppression', () => ({
  suppressEmail: vi.fn(async () => ({ created: true })),
}));
vi.mock('@/lib/webhooks/sns-verify', () => ({
  verifySnsSignature: vi.fn(async () => undefined),
}));

import { recordWebhookEvent } from '@/lib/db/orders';
import { suppressEmail } from '@/lib/emails/suppression';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/webhooks/ses', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  vi.resetAllMocks();
  // Re-set defaults after resetAllMocks
  vi.mocked(recordWebhookEvent).mockResolvedValue({ isNew: true });
  vi.mocked(suppressEmail).mockResolvedValue({ created: true });
  process.env = {
    ...ORIG_ENV,
    NODE_ENV: 'test',
    OD_SKIP_SNS_VERIFY: '1',
  };
  delete process.env.SES_SNS_TOPIC_ARN;
});

describe('POST /api/webhooks/ses (Round 39 #4)', () => {
  it('400 si JSON invalide', async () => {
    const { POST } = await import('@/app/api/webhooks/ses/route');
    const res = await POST(makeReq('not json'));
    expect(res.status).toBe(400);
  });

  it('400 si SNS envelope incomplet (pas de Signature)', async () => {
    const { POST } = await import('@/app/api/webhooks/ses/route');
    const res = await POST(makeReq({ Type: 'Notification', MessageId: 'x', TopicArn: 'arn:..' }));
    expect(res.status).toBe(400);
  });

  it('401 si SES_SNS_TOPIC_ARN env set et ne match pas', async () => {
    process.env.SES_SNS_TOPIC_ARN = 'arn:aws:sns:us-east-1:123:expected-topic';
    const { POST } = await import('@/app/api/webhooks/ses/route');
    const res = await POST(makeReq({
      Type: 'Notification',
      MessageId: 'msg-1',
      TopicArn: 'arn:aws:sns:us-east-1:999:wrong-topic',
      Signature: 'fake',
      SigningCertURL: 'https://sns.us-east-1.amazonaws.com/cert.pem',
      Message: '{}',
      Timestamp: new Date().toISOString(),
    }));
    expect(res.status).toBe(401);
  });

  it('SubscriptionConfirmation → fetch SubscribeURL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('ok', { status: 200 }),
    );
    const { POST } = await import('@/app/api/webhooks/ses/route');
    const res = await POST(makeReq({
      Type: 'SubscriptionConfirmation',
      MessageId: 'msg-sub-1',
      TopicArn: 'arn:aws:sns:us-east-1:123:plio-ses',
      Signature: 'fake',
      SigningCertURL: 'https://sns.us-east-1.amazonaws.com/cert.pem',
      SubscribeURL: 'https://sns.us-east-1.amazonaws.com/subscribe?Token=abc',
      Token: 'abc',
      Message: 'You have chosen to subscribe...',
      Timestamp: new Date().toISOString(),
    }));
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith('https://sns.us-east-1.amazonaws.com/subscribe?Token=abc');
    fetchSpy.mockRestore();
  });

  it('Bounce Permanent → suppressEmail HARD_BOUNCE pour chaque recipient', async () => {
    const innerMessage = JSON.stringify({
      notificationType: 'Bounce',
      mail: { messageId: 'ses-mail-1', source: 'noreply@plio.ca' },
      bounce: {
        bounceType: 'Permanent',
        bounceSubType: 'General',
        bouncedRecipients: [
          { emailAddress: 'gone@nowhere.ca', status: '5.1.1', diagnosticCode: 'smtp; 550 user unknown' },
          { emailAddress: 'also-gone@nowhere.ca' },
        ],
      },
    });
    const { POST } = await import('@/app/api/webhooks/ses/route');
    const res = await POST(makeReq({
      Type: 'Notification',
      MessageId: 'msg-bounce-1',
      TopicArn: 'arn:aws:sns:us-east-1:123:plio-ses',
      Signature: 'fake',
      SigningCertURL: 'https://sns.us-east-1.amazonaws.com/cert.pem',
      Message: innerMessage,
      Timestamp: new Date().toISOString(),
    }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.suppressed).toBe(2);
    expect(json.permanent).toBe(true);
    expect(suppressEmail).toHaveBeenCalledTimes(2);
    const firstCall = vi.mocked(suppressEmail).mock.calls[0]![0];
    expect(firstCall.email).toBe('gone@nowhere.ca');
    expect(firstCall.reason).toBe('HARD_BOUNCE');
    expect(firstCall.source).toBe('SES_BOUNCE');
  });

  it('Bounce Transient → log only, AUCUN suppressEmail', async () => {
    const innerMessage = JSON.stringify({
      notificationType: 'Bounce',
      mail: { messageId: 'ses-mail-2', source: 'noreply@plio.ca' },
      bounce: {
        bounceType: 'Transient',
        bounceSubType: 'MailboxFull',
        bouncedRecipients: [{ emailAddress: 'full@plio.ca' }],
      },
    });
    const { POST } = await import('@/app/api/webhooks/ses/route');
    const res = await POST(makeReq({
      Type: 'Notification',
      MessageId: 'msg-bounce-2',
      TopicArn: 'arn:aws:sns:us-east-1:123:plio-ses',
      Signature: 'fake',
      SigningCertURL: 'https://sns.us-east-1.amazonaws.com/cert.pem',
      Message: innerMessage,
      Timestamp: new Date().toISOString(),
    }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.suppressed).toBe(0);
    expect(json.permanent).toBe(false);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it('Complaint → suppressEmail COMPLAINT pour chaque recipient', async () => {
    const innerMessage = JSON.stringify({
      notificationType: 'Complaint',
      mail: { messageId: 'ses-mail-3', source: 'noreply@plio.ca' },
      complaint: {
        complaintFeedbackType: 'abuse',
        complainedRecipients: [{ emailAddress: 'angry@plio.ca' }],
      },
    });
    const { POST } = await import('@/app/api/webhooks/ses/route');
    const res = await POST(makeReq({
      Type: 'Notification',
      MessageId: 'msg-comp-1',
      TopicArn: 'arn:aws:sns:us-east-1:123:plio-ses',
      Signature: 'fake',
      SigningCertURL: 'https://sns.us-east-1.amazonaws.com/cert.pem',
      Message: innerMessage,
      Timestamp: new Date().toISOString(),
    }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.suppressed).toBe(1);
    expect(json.kind).toBe('complaint');
    expect(suppressEmail).toHaveBeenCalledTimes(1);
    const call = vi.mocked(suppressEmail).mock.calls[0]![0];
    expect(call.email).toBe('angry@plio.ca');
    expect(call.reason).toBe('COMPLAINT');
  });

  it('dedup sur SNS MessageId : 2e event même id → 200 deduped', async () => {
    vi.mocked(recordWebhookEvent).mockResolvedValueOnce({ isNew: false });
    const { POST } = await import('@/app/api/webhooks/ses/route');
    const res = await POST(makeReq({
      Type: 'Notification',
      MessageId: 'msg-dup-1',
      TopicArn: 'arn:aws:sns:us-east-1:123:plio-ses',
      Signature: 'fake',
      SigningCertURL: 'https://sns.us-east-1.amazonaws.com/cert.pem',
      Message: '{}',
      Timestamp: new Date().toISOString(),
    }));
    const json = await res.json();
    expect(json.deduped).toBe(true);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it('Notification inner type Delivery → ignored proprement', async () => {
    const innerMessage = JSON.stringify({
      notificationType: 'Delivery',
      mail: { messageId: 'x' },
      delivery: { recipients: ['ok@plio.ca'] },
    });
    const { POST } = await import('@/app/api/webhooks/ses/route');
    const res = await POST(makeReq({
      Type: 'Notification',
      MessageId: 'msg-deliv-1',
      TopicArn: 'arn:aws:sns:us-east-1:123:plio-ses',
      Signature: 'fake',
      SigningCertURL: 'https://sns.us-east-1.amazonaws.com/cert.pem',
      Message: innerMessage,
      Timestamp: new Date().toISOString(),
    }));
    const json = await res.json();
    expect(json.ignored).toBe(true);
    expect(suppressEmail).not.toHaveBeenCalled();
  });
});
