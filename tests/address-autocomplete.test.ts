/**
 * Tests pour le wrapper Canada Post + les routes /api/address/*.
 * Mocks `fetch` global pour simuler les réponses Canada Post.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return {
    log: stub, logStripe: stub, logSinalite: stub, logAuth: stub,
    logEmail: stub, logS3: stub, logAdmin: stub, logWebhook: stub,
  };
});

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: vi.fn(() => '1.2.3.4'),
}));

import { rateLimit } from '@/lib/ratelimit';

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockResolvedValue({ ok: true } as never);
  vi.unstubAllEnvs();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
});

async function importLib() {
  vi.resetModules();
  return await import('@/lib/address/canadapost');
}

async function importAutocompleteRoute() {
  vi.resetModules();
  return (await import('@/app/api/address/autocomplete/route')).GET;
}

async function importRetrieveRoute() {
  vi.resetModules();
  return (await import('@/app/api/address/retrieve/route')).GET;
}

describe('isAutocompleteAvailable', () => {
  it('false si pas de CANADA_POST_API_KEY', async () => {
    vi.stubEnv('CANADA_POST_API_KEY', '');
    const lib = await importLib();
    expect(lib.isAutocompleteAvailable()).toBe(false);
  });

  it('true si CANADA_POST_API_KEY set', async () => {
    vi.stubEnv('CANADA_POST_API_KEY', 'xxx-yyy');
    const lib = await importLib();
    expect(lib.isAutocompleteAvailable()).toBe(true);
  });
});

describe('findAddresses', () => {
  it('returns [] si query < 3 chars', async () => {
    vi.stubEnv('CANADA_POST_API_KEY', 'xxx');
    const lib = await importLib();
    expect(await lib.findAddresses('ab')).toEqual([]);
  });

  it('returns [] si pas de API key', async () => {
    vi.stubEnv('CANADA_POST_API_KEY', '');
    const lib = await importLib();
    expect(await lib.findAddresses('1234 rue Saint')).toEqual([]);
  });

  it('parse Items from Canada Post Find response', async () => {
    vi.stubEnv('CANADA_POST_API_KEY', 'xxx');
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        Items: [
          { Id: 'CA|123', Text: '1234 RUE SAINT-DENIS, MONTREAL', Type: 'Address', Description: 'H2X 1Z3' },
          { Id: 'CA|456', Text: '1234 RUE SAINT-DENIS, OUTREMONT', Type: 'Address' },
        ],
      }),
    })) as never;
    const lib = await importLib();
    const items = await lib.findAddresses('1234 rue Saint');
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('CA|123');
    expect(items[0].text).toBe('1234 RUE SAINT-DENIS, MONTREAL');
    expect(items[0].type).toBe('Address');
  });

  it('returns [] si Items[0].Error présent', async () => {
    vi.stubEnv('CANADA_POST_API_KEY', 'xxx');
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ Items: [{ Error: 'Invalid key' }] }),
    })) as never;
    const lib = await importLib();
    expect(await lib.findAddresses('1234 rue Saint')).toEqual([]);
  });

  it('returns [] si HTTP error', async () => {
    vi.stubEnv('CANADA_POST_API_KEY', 'xxx');
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as never;
    const lib = await importLib();
    expect(await lib.findAddresses('1234')).toEqual([]);
  });
});

describe('retrieveAddress', () => {
  it('returns null si pas de id', async () => {
    vi.stubEnv('CANADA_POST_API_KEY', 'xxx');
    const lib = await importLib();
    expect(await lib.retrieveAddress('')).toBeNull();
  });

  it('parse une AddressDetail valide CA', async () => {
    vi.stubEnv('CANADA_POST_API_KEY', 'xxx');
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        Items: [
          {
            Line1: '1234 Rue Saint-Denis',
            Line2: 'App 304',
            City: 'Montréal',
            ProvinceCode: 'QC',
            PostalCode: 'h2x 1z3',
            CountryIso2: 'CA',
          },
        ],
      }),
    })) as never;
    const lib = await importLib();
    const addr = await lib.retrieveAddress('CA|123');
    expect(addr).toEqual({
      line1: '1234 Rue Saint-Denis',
      line2: 'App 304',
      city: 'Montréal',
      province: 'QC',
      postalCode: 'H2X 1Z3',
      country: 'CA',
    });
  });

  it('returns null si address non-CA', async () => {
    vi.stubEnv('CANADA_POST_API_KEY', 'xxx');
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        Items: [{ Line1: '5th Ave', City: 'NYC', CountryIso2: 'US' }],
      }),
    })) as never;
    const lib = await importLib();
    expect(await lib.retrieveAddress('US|xxx')).toBeNull();
  });
});

describe('GET /api/address/autocomplete', () => {
  it('available: false si CANADA_POST_API_KEY pas set', async () => {
    vi.stubEnv('CANADA_POST_API_KEY', '');
    const GET = await importAutocompleteRoute();
    const res = await GET(new Request('http://localhost/api/address/autocomplete?q=1234'));
    const json = await res.json();
    expect(json.available).toBe(false);
    expect(json.items).toEqual([]);
  });

  it('forward query + lastId à Canada Post', async () => {
    vi.stubEnv('CANADA_POST_API_KEY', 'xxx');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ Items: [{ Id: 'CA|1', Text: '1234 RUE', Type: 'Address' }] }),
    }));
    global.fetch = fetchMock as never;
    const GET = await importAutocompleteRoute();
    const res = await GET(new Request('http://localhost/api/address/autocomplete?q=1234&lastId=CA|abc'));
    const json = await res.json();
    expect(json.available).toBe(true);
    expect(json.items).toHaveLength(1);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
    expect(calledUrl).toContain('SearchTerm=1234');
    expect(calledUrl).toContain('LastId=');
  });
});

describe('GET /api/address/retrieve', () => {
  it('400 si pas de id query param', async () => {
    const GET = await importRetrieveRoute();
    const res = await GET(new Request('http://localhost/api/address/retrieve'));
    expect(res.status).toBe(400);
  });

  it('200 + address si valide', async () => {
    vi.stubEnv('CANADA_POST_API_KEY', 'xxx');
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        Items: [{ Line1: '123 Main', City: 'Montréal', ProvinceCode: 'QC', PostalCode: 'H2X 1Z3', CountryIso2: 'CA' }],
      }),
    })) as never;
    const GET = await importRetrieveRoute();
    const res = await GET(new Request('http://localhost/api/address/retrieve?id=CA|123'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.address.city).toBe('Montréal');
  });

  it('404 si Canada Post ne trouve pas', async () => {
    vi.stubEnv('CANADA_POST_API_KEY', '');
    const GET = await importRetrieveRoute();
    const res = await GET(new Request('http://localhost/api/address/retrieve?id=CA|123'));
    expect(res.status).toBe(404);
  });
});
