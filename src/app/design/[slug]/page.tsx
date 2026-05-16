/**
 * /design/[slug] — éditeur de template.
 *
 * Server Component qui charge le template depuis le registry et passe à
 * l'éditeur client. Si le slug n'existe pas → notFound().
 */

import { notFound } from 'next/navigation';
import DesignEditor from '@/components/design/DesignEditor';
import { getTemplateBySlug } from '@/lib/templates/registry';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = getTemplateBySlug(slug);
  return { title: t ? `${t.name} — Plio` : 'Template — Plio' };
}

export default async function DesignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const template = getTemplateBySlug(slug);
  if (!template) notFound();

  return <DesignEditor template={template} />;
}
