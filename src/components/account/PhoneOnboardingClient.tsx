'use client';

/**
 * Enveloppe cliente de l'étape téléphone obligatoire : réutilise
 * `PhoneVerifyPanel` et ramène l'utilisateur là où il allait une fois le
 * numéro vérifié.
 *
 * `window.location.assign` plutôt que `router.push` : la garde
 * `exigerTelephoneVerifie` lit `phoneVerified` CÔTÉ SERVEUR. Une navigation
 * client pourrait resservir un rendu mis en cache datant d'avant la
 * vérification, et le garde renverrait l'utilisateur ici — une boucle juste
 * après un succès. Un vrai chargement garantit un rendu serveur frais.
 */

import PhoneVerifyPanel from './PhoneVerifyPanel';

export default function PhoneOnboardingClient({ retour }: { retour: string }) {
  return (
    <PhoneVerifyPanel
      onVerifie={() => {
        window.location.assign(retour);
      }}
    />
  );
}
