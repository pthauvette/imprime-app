/**
 * Wrapper around the Canada Post AddressComplete API.
 *
 * 2 endpoints needed :
 *   - Find    : fuzzy search "1234 Saint-D" → list of candidates with NextId
 *   - Retrieve: NextId → full address structurée (street, city, province, postal)
 *
 * Pricing: ~0.005 CAD par lookup (Find + Retrieve = 2 lookups). À ~200
 * checkout/jour = 1 $/jour. Vivable. Si on dépasse, switch sur le free tier
 * Google Places ou un fallback regex pur.
 *
 * Si CANADA_POST_API_KEY pas configuré → toutes les fonctions retournent
 * `null` ou `[]`, et le composant client tombe sur un mode "no suggestions"
 * (input texte standard). Pas de crash, pas de bug visible.
 */

import { log } from '@/lib/logger';

const API_KEY = process.env.CANADA_POST_API_KEY;
const FIND_URL = 'https://ws1.postescanada-canadapost.ca/AddressComplete/Interactive/Find/v2.10/json3.ws';
const RETRIEVE_URL = 'https://ws1.postescanada-canadapost.ca/AddressComplete/Interactive/Retrieve/v2.11/json3.ws';

export interface AddressFindResult {
  /** Identifiant interne Canada Post pour le call Retrieve subséquent. */
  id: string;
  /** Texte affiché au user dans la dropdown (ex: "123 RUE SAINT-DENIS, MONTRÉAL, QC, H2X 1Z3"). */
  text: string;
  /** Texte secondaire optionnel (ex: "Find more" si nested container). */
  description?: string;
  /** Type : Address | Postcode | Street | etc. */
  type: 'Address' | 'Postcode' | 'Street' | 'PostalCode' | string;
}

export interface AddressDetail {
  line1: string;
  line2: string;
  city: string;
  /** Province ISO code (QC, ON, BC, ...). */
  province: string;
  postalCode: string;
  /** ISO country code (always CA dans notre filtre). */
  country: 'CA';
}

export function isAutocompleteAvailable(): boolean {
  return !!API_KEY;
}

/**
 * Find : fuzzy search par texte partiel. Retourne max ~7 candidats.
 *
 * @param query Texte tapé par le user (min 3 chars sinon retourne []).
 * @param lastId Optionnel : ID d'un précédent résultat de type "Street"
 *   (= containers) pour drill-down sur les addresses dans cette rue.
 */
export async function findAddresses(
  query: string,
  lastId?: string,
): Promise<AddressFindResult[]> {
  if (!API_KEY || query.trim().length < 3) return [];

  const params = new URLSearchParams({
    Key: API_KEY,
    SearchTerm: query.trim(),
    Country: 'CAN',
    MaxSuggestions: '7',
    LanguagePreference: 'en',
    ...(lastId ? { LastId: lastId } : {}),
  });

  try {
    const res = await fetch(`${FIND_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      log.warn({ status: res.status }, 'canadapost Find failed');
      return [];
    }
    const json = await res.json();
    const items = (json?.Items ?? []) as Array<{
      Id?: string;
      Text?: string;
      Description?: string;
      Type?: string;
      Error?: string;
    }>;

    // Canada Post returns errors in Items[0].Error when something goes wrong
    if (items[0]?.Error) {
      log.warn({ error: items[0].Error }, 'canadapost Find returned error');
      return [];
    }

    return items
      .filter((x) => x.Id && x.Text)
      .map((x) => ({
        id: x.Id!,
        text: x.Text!,
        description: x.Description,
        type: (x.Type ?? 'Address') as AddressFindResult['type'],
      }));
  } catch (err) {
    log.warn({ err }, 'canadapost Find threw');
    return [];
  }
}

/** Retrieve : full address parsée à partir d'un Find ID. */
export async function retrieveAddress(id: string): Promise<AddressDetail | null> {
  if (!API_KEY || !id) return null;

  const params = new URLSearchParams({
    Key: API_KEY,
    Id: id,
  });

  try {
    const res = await fetch(`${RETRIEVE_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      log.warn({ status: res.status }, 'canadapost Retrieve failed');
      return null;
    }
    const json = await res.json();
    const item = (json?.Items ?? [])[0] as
      | {
          Line1?: string;
          Line2?: string;
          City?: string;
          ProvinceCode?: string;
          PostalCode?: string;
          CountryIso2?: string;
          Error?: string;
        }
      | undefined;

    if (!item || item.Error) {
      log.warn({ error: item?.Error }, 'canadapost Retrieve returned error');
      return null;
    }

    // On exige CA — sinon notre Sinalite shipping ne marche pas
    if (item.CountryIso2 && item.CountryIso2 !== 'CA') {
      log.warn({ country: item.CountryIso2 }, 'canadapost Retrieve non-CA address');
      return null;
    }

    return {
      line1: (item.Line1 ?? '').trim(),
      line2: (item.Line2 ?? '').trim(),
      city: (item.City ?? '').trim(),
      province: (item.ProvinceCode ?? '').trim().toUpperCase(),
      postalCode: (item.PostalCode ?? '').trim().toUpperCase(),
      country: 'CA',
    };
  } catch (err) {
    log.warn({ err }, 'canadapost Retrieve threw');
    return null;
  }
}
