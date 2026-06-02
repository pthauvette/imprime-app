/**
 * /design/[slug] — éditeur de template.
 *
 * Server Component qui charge le template depuis le registry et passe à
 * l'éditeur client. Si le slug n'existe pas → notFound().
 */

import { notFound } from 'next/navigation';
import DesignEditor from '@/components/design/DesignEditor';
import { getTemplateBySlug } from '@/lib/templates/registry';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ draftId?: string }>;
}) {
  const { slug } = await params;
  const { draftId } = await searchParams;
  const template = getTemplateBySlug(slug);
  if (!template) notFound();

  // Reprise depuis /drafts : on restaure les valeurs SI le draft appartient à
  // l'user connecté (filtre userId → pas de lecture cross-user). Si absent /
  // non possédé / JSON corrompu, on retombe silencieusement sur sampleValues
  // (le wizard reste utilisable, on ne notFound() pas pour un draftId pourri).
  let draftId_ok: string | undefined;
  let initialValues: Record<string, string> | undefined;
  if (draftId) {
    const session = await auth();
    if (session?.user) {
      const draft = await prisma.designDraft.findFirst({
        where: { id: draftId, userId: session.user.id, orderId: null },
        select: { id: true, values: true },
      });
      if (draft) {
        try {
          const parsed = JSON.parse(draft.values) as Record<string, string>;
          if (parsed && typeof parsed === 'object') {
            draftId_ok = draft.id;
            initialValues = parsed;
          }
        } catch {
          // values corrompu → on ignore, fallback sampleValues
        }
      }
    }
  }

  return (
    <DesignEditor template={template} draftId={draftId_ok} initialValues={initialValues} />
  );
}
