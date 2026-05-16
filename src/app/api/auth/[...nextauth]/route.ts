/**
 * Auth.js v5 catch-all route — délègue tout vers les handlers configurés
 * dans `src/auth.ts`. Couvre /api/auth/signin, /api/auth/callback/[provider],
 * /api/auth/signout, /api/auth/session, etc.
 */

export { GET, POST } from '@/auth-handlers';
