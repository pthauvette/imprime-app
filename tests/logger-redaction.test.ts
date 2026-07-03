/**
 * Revue privacy Loi 25 / LPRPDE — le logger ne doit JAMAIS émettre de PII client
 * en clair (les logs partent sur CloudWatch). Verrouille la config redact Pino.
 */

import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { REDACT_PATHS } from '@/lib/logger';

/** Capture la sortie JSON d'un logger Pino configuré avec nos REDACT_PATHS. */
function capture(fn: (log: pino.Logger) => void): string {
  const lines: string[] = [];
  const dest = { write: (s: string) => void lines.push(s) };
  const log = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, dest as never);
  fn(log);
  return lines.join('');
}

describe('logger — redaction PII (Loi 25)', () => {
  it('censure email + phone au niveau racine, garde le reste', () => {
    const out = capture((l) =>
      l.warn({ email: 'client@exemple.ca', phone: '5145551234', orderId: 'o_1' }, 'x'),
    );
    expect(out).not.toContain('client@exemple.ca');
    expect(out).not.toContain('5145551234');
    expect(out).toContain('[REDACTED]');
    expect(out).toContain('o_1'); // champ non-PII conservé pour le débogage
  });

  it('censure un email imbriqué (contact.email)', () => {
    const out = capture((l) => l.info({ contact: { email: 'a@b.com' } }, 'x'));
    expect(out).not.toContain('a@b.com');
  });

  it('ne touche PAS une clé distincte comme adminEmail (personnel, pas PII client)', () => {
    const out = capture((l) => l.error({ adminEmail: 'ops@plio.ca' }, 'notif failed'));
    expect(out).toContain('ops@plio.ca');
  });

  it('censure le courriel destinataire sous `to` / `recipient` (audit v3 M5)', () => {
    const out = capture((l) => l.info({ to: 'client@exemple.ca', recipient: 'autre@exemple.ca' }, 'email send'));
    expect(out).not.toContain('client@exemple.ca');
    expect(out).not.toContain('autre@exemple.ca');
    expect(out).toContain('[REDACTED]');
  });

  it('couvre les secrets historiques (password/secret/token)', () => {
    const out = capture((l) => l.info({ password: 'hunter2', token: 'abc', secret: 's' }, 'x'));
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('"abc"');
  });

  it('censure un email/phone niché en PROFONDEUR 3 et 4 (Audit 2026-07 — fast-redact sans **)', () => {
    const out = capture((l) =>
      l.info(
        {
          d3: { order: { email: 'd3@exemple.ca', phone: '5140000003' } }, // *.*.{email,phone}
          d4: { data: { order: { email: 'd4@exemple.ca' } } }, // *.*.*.email
        },
        'x',
      ),
    );
    expect(out).not.toContain('d3@exemple.ca');
    expect(out).not.toContain('5140000003');
    expect(out).not.toContain('d4@exemple.ca');
    expect(out).toContain('[REDACTED]');
  });

  it('censure `to`/`recipient` + un credential nichés en profondeur (Audit 2026-07)', () => {
    const out = capture((l) =>
      l.info(
        {
          msg: { batch: { to: 'deep@exemple.ca' } }, // *.*.to
          ctx: { auth: { token: 'deep-token-xyz' } }, // *.*.token
        },
        'x',
      ),
    );
    expect(out).not.toContain('deep@exemple.ca');
    expect(out).not.toContain('deep-token-xyz');
  });
});
