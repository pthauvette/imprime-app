/**
 * getCompanyIdentity — Audit v2 #10.8 (source unique de l'identité fiscale).
 *
 * Verrouille : lecture des env vars + fallback sur placeholder si VIDE (|| et
 * non ??, car une env var vide en dev/CI ne doit pas afficher une chaîne vide
 * sur une facture à valeur légale).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCompanyIdentity } from '@/lib/company/identity';

afterEach(() => vi.unstubAllEnvs());

describe('getCompanyIdentity (#10.8)', () => {
  it('utilise les env vars quand présentes', () => {
    vi.stubEnv('COMPANY_LEGAL_NAME', 'Démocratik inc.');
    vi.stubEnv('COMPANY_ADDRESS', '4321 boul. Saint-Laurent, Montréal QC');
    vi.stubEnv('COMPANY_NEQ_NUMBER', '1173456789');
    vi.stubEnv('COMPANY_GST_NUMBER', '123456789 RT0001');
    vi.stubEnv('COMPANY_QST_NUMBER', '1234567890 TQ0001');

    expect(getCompanyIdentity()).toEqual({
      legalName: 'Démocratik inc.',
      address: '4321 boul. Saint-Laurent, Montréal QC',
      neq: '1173456789',
      gst: '123456789 RT0001',
      qst: '1234567890 TQ0001',
    });
  });

  it('env var VIDE → fallback placeholder (|| pas ??)', () => {
    vi.stubEnv('COMPANY_NEQ_NUMBER', '');
    vi.stubEnv('COMPANY_GST_NUMBER', '');
    vi.stubEnv('COMPANY_QST_NUMBER', '');
    const c = getCompanyIdentity();
    expect(c.neq).toBe('(NEQ à venir)');
    expect(c.gst).toBe('(num. TPS à venir)');
    expect(c.qst).toBe('(num. TVQ à venir)');
  });

  it('env var absente → fallback placeholder', () => {
    vi.stubEnv('COMPANY_LEGAL_NAME', '');
    vi.stubEnv('COMPANY_ADDRESS', '');
    const c = getCompanyIdentity();
    expect(c.legalName).toBe('Démocratik inc.');
    expect(c.address).toBe('Montréal QC, Canada');
  });
});
