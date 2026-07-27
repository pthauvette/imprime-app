/**
 * « Signaler un problème » sur une commande livrée — finding [45].
 *
 * La politique de remboursement promet un flux `mailto:` DIRECT avec photo en
 * pièce jointe courriel (pas un formulaire web upload) — cf. legal/refund-
 * policy/page.tsx : « envoie une photo dans les 10 jours ouvrables ». Ce lien
 * pré-remplit juste subject/body pour ne pas faire retaper le numéro de
 * commande ; aucun système d'upload à construire.
 */

export default function ReportProblemLink({ displayId }: { displayId: string }) {
  const subject = `Problème avec ma commande ${displayId}`;
  const body = `Bonjour,\n\nJ'ai reçu ma commande ${displayId}, mais j'ai un problème avec le résultat.\n\n[Décris le problème ici — n'oublie pas de joindre une photo du défaut à ce courriel.]`;
  const href = `mailto:bonjour@plio.ca?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <a
      href={href}
      className="btn btn-ghost"
      style={{ width: '100%', textAlign: 'center', display: 'block' }}
    >
      Signaler un problème avec cette commande
    </a>
  );
}
