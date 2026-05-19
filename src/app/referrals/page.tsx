/**
 * /referrals — DEPRECATED orphan page.
 *
 * Cette page était un lift-and-shift HTML statique avec counts hardcodés,
 * code `PATRICK-25` hardcodé, et tous les boutons share dead. La vraie
 * page est `/account/referrals` (auth-required, vraie data depuis Prisma).
 *
 * Un user pas loggué va atterrir sur /sign-in?callbackUrl=/account/referrals
 * via le redirect dans /account/referrals/page.tsx.
 */

import { redirect } from 'next/navigation';
import type { Route } from 'next';

export const metadata = { title: 'Parrainage — Plio' };

export default function ReferralsPage() {
  redirect('/account/referrals' as Route);
}
