/**
 * Scrub des PII dans le snapshot JSON `Order.sinalitePayload` (audit v3 H1).
 *
 * La suppression PIPEDA anonymise les colonnes `Order.ship*` mais le champ
 * `sinalitePayload` (snapshot complet du payload Sinalite, conservé pour la
 * rétention fiscale LIR 6 ans) contenait en clair nom/courriel/adresse/téléphone
 * de livraison ET de facturation → contredisait le courriel « supprimé » envoyé
 * au client. Ce helper ré-écrit le JSON en remplaçant ces champs par les mêmes
 * sentinelles que le reste de la transaction, en conservant les items/options/
 * notes et `ShipState` (province, non identifiant, utile au rapport CRA).
 *
 * Pur → testable sans DB (cf. tests/scrub-sinalite-payload.test.ts).
 */

export interface ScrubSentinels {
  /** Remplace nom + lignes d'adresse + ville. */
  text: string;
  /** Remplace les courriels. */
  email: string;
  /** Remplace les codes postaux (format valide, ex. 'A0A 0A0'). */
  postal: string;
  /** Remplace les téléphones (format valide, ex. '+10000000000'). */
  phone: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null;

const NAME_LIKE = ['ShipFName', 'ShipLName', 'ShipAddr', 'ShipCity', 'BillFName', 'BillLName', 'BillAddr', 'BillCity'];
const EMAIL_LIKE = ['ShipEmail', 'BillEmail'];
const POSTAL_LIKE = ['ShipZip', 'BillZip'];
const PHONE_LIKE = ['ShipPhone', 'BillPhone'];
const BLANK_LIKE = ['ShipAddr2', 'BillAddr2'];

function scrubBlock(block: unknown, s: ScrubSentinels): void {
  if (!isObj(block)) return;
  for (const k of NAME_LIKE) if (k in block) block[k] = s.text;
  for (const k of EMAIL_LIKE) if (k in block) block[k] = s.email;
  for (const k of POSTAL_LIKE) if (k in block) block[k] = s.postal;
  for (const k of PHONE_LIKE) if (k in block) block[k] = s.phone;
  for (const k of BLANK_LIKE) if (k in block) block[k] = '';
  // ShipState / BillState (province) conservés volontairement (non identifiants,
  // utiles au rapport fiscal CRA — cohérent avec Order.shipProvince conservé).
}

/**
 * Renvoie le JSON `sinalitePayload` avec les PII de shippingInfo + billingInfo
 * remplacées par les sentinelles. Si le JSON est illisible, renvoie l'entrée
 * telle quelle (rien d'exploitable à parser de toute façon).
 */
export function scrubSinalitePayloadPII(json: string, s: ScrubSentinels): string {
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return json;
  }
  if (!isObj(payload)) return json;
  scrubBlock(payload.shippingInfo, s);
  scrubBlock(payload.billingInfo, s);
  return JSON.stringify(payload);
}
