/**
 * Identité fiscale du vendeur (TPS/TVQ + raison sociale) — SOURCE UNIQUE.
 *
 * Audit v2 #10.8 — ce bloc était dupliqué TEXTUELLEMENT dans emails/send.ts,
 * emails/queue.ts et orders/[id]/invoice.pdf. Un changement de numéro de taxe
 * (ex. enregistrement TPS/TVQ obtenu) devait être répliqué à 3 endroits → risque
 * d'incohérence sur des documents à valeur LÉGALE (facture art. 169 LTA / 350
 * LTVQ). Centralisé ici.
 *
 * `||` (pas `??`) volontaire : une env var VIDE (fréquente en dev/CI) doit
 * retomber sur le placeholder, pas afficher une chaîne vide sur la facture.
 */
export interface CompanyIdentity {
  legalName: string;
  address: string;
  /** Numéro d'entreprise du Québec (NEQ), 10 chiffres. */
  neq: string;
  /** Numéro TPS/GST, format « 123456789 RT0001 ». */
  gst: string;
  /** Numéro TVQ/QST, format « 1234567890 TQ0001 ». */
  qst: string;
}

export function getCompanyIdentity(): CompanyIdentity {
  return {
    legalName: process.env.COMPANY_LEGAL_NAME || 'Démocratik inc.',
    address: process.env.COMPANY_ADDRESS || 'Montréal QC, Canada',
    neq: process.env.COMPANY_NEQ_NUMBER || '(NEQ à venir)',
    gst: process.env.COMPANY_GST_NUMBER || '(num. TPS à venir)',
    qst: process.env.COMPANY_QST_NUMBER || '(num. TVQ à venir)',
  };
}
