/**
 * Layout pour /admin/* — mount le CommandPalette global (Cmd/Ctrl+K).
 *
 * On garde le layout minimal pour ne pas perturber le rendering des
 * pages admin existantes (qui ont chacune leur structure adm-shell).
 * Le CommandPalette est position:fixed + display:none par défaut donc
 * il n'impacte ni layout ni SEO.
 *
 * Auth admin est checké par chaque page admin individuellement via
 * requireAdmin() ou AdminSidebar (qui passe user.role). On ne re-check
 * pas ici pour éviter une double query, mais le layout étant client de
 * server-only nav, un non-admin atterrirait sur les pages avec accès
 * refusé en aval.
 */

import type { ReactNode } from 'react';
import CommandPalette from '@/components/admin/CommandPalette';
import AdminNavToggle from '@/components/admin/AdminNavToggle';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      {/* Montés UNE seule fois ici (plus dans AdminSidebar) : palette Cmd+K +
          hamburger/drawer pour la nav <1024px (Round 4 #5). */}
      <CommandPalette />
      <AdminNavToggle />
    </>
  );
}
