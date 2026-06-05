'use server';

/**
 * Server Action — rectification self-serve du profil (Loi 25 art. 27).
 * Mince : auth → normalise (helper pur testé) → persiste → révalide.
 */
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { normalizeProfileInput } from '@/lib/account/profile';

export interface ProfileFormState {
  ok?: boolean;
  error?: string;
}

export async function updateProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Session expirée. Reconnecte-toi pour modifier ton profil.' };
  }

  const result = normalizeProfileInput({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    phone: formData.get('phone'),
  });
  if (!result.ok) {
    return { error: result.error };
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: result.data,
    });
  } catch {
    return { error: 'Enregistrement impossible pour le moment. Réessaie.' };
  }

  revalidatePath('/settings');
  return { ok: true };
}
