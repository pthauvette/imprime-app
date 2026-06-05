'use client';

/**
 * Formulaire de rectification du profil (Loi 25 art. 27). Champs éditables :
 * prénom / nom / téléphone. Le courriel (identité d'auth) est affiché ailleurs,
 * non éditable ici. `useActionState` fournit le feedback inline (erreur, succès,
 * pending) sans gérer manuellement le state des inputs (uncontrolled + defaultValue).
 */
import { useActionState } from 'react';
import { updateProfile, type ProfileFormState } from '@/app/settings/profile-actions';

interface Props {
  initial: { firstName: string; lastName: string; phone: string };
}

export default function EditProfileForm({ initial }: Props) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(
    updateProfile,
    {},
  );

  return (
    <form action={action} className="field-stack" style={{ paddingTop: 8 }}>
      <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="field">
          <label htmlFor="firstName">Prénom</label>
          <input
            id="firstName"
            name="firstName"
            type="text"
            defaultValue={initial.firstName}
            maxLength={100}
            autoComplete="given-name"
            placeholder="Sophie"
          />
        </div>
        <div className="field">
          <label htmlFor="lastName">Nom</label>
          <input
            id="lastName"
            name="lastName"
            type="text"
            defaultValue={initial.lastName}
            maxLength={100}
            autoComplete="family-name"
            placeholder="Beauchamp"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="phone">Téléphone (optionnel)</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={initial.phone}
          maxLength={30}
          autoComplete="tel"
          placeholder="(514) 555-1234"
        />
      </div>

      {state.error && (
        <div role="alert" className="field-helper error" style={{ marginTop: 0 }}>
          {state.error}
        </div>
      )}
      {state.ok && !state.error && (
        <div
          role="status"
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}
        >
          ✓ Modifications enregistrées.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}
