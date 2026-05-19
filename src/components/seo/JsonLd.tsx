/**
 * Composant pour injecter du JSON-LD structured data (schema.org).
 *
 * Les data generators (organizationSchema, productSchema, etc.) vivent
 * dans schemas.ts pour être testables sans JSX. On les re-exporte ici
 * pour éviter de casser les imports existants.
 *
 * Usage : `<JsonLd data={organizationSchema} />` dans le layout root
 * ou n'importe quelle page. Server Component-safe (pas de hooks).
 */

import 'server-only';

export {
  organizationSchema,
  websiteSchema,
  localBusinessSchema,
  breadcrumbSchema,
  itemListSchema,
  productSchema,
  type ProductSchemaInput,
} from './schemas';

interface JsonLdProps {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}

export default function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      // dangerouslySetInnerHTML acceptable ici : on contrôle 100% le contenu,
      // pas de user input dans les schemas (que des constantes server-side).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
