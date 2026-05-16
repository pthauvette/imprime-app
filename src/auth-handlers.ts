/**
 * Ré-export des handlers Auth.js — split out de `auth.ts` parce que le
 * route handler ne peut pas re-exporter directement depuis un module qui
 * exporte aussi d'autres choses (Next.js complain sur "invalid named export").
 */

import { handlers } from '@/auth';

export const { GET, POST } = handlers;
