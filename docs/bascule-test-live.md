# Bascule test ↔ live — Stripe & Sinalite

Procédure de référence. À suivre **dans l'ordre**, sans rejouer de mémoire.

Vérification après chaque étape :

```bash
node scripts/check-prelaunch.mjs
```

---

## 1. La règle qui gouverne tout : les deux systèmes sont couplés

Stripe encaisse. Sinalite produit. Les désaccorder coûte dans **les deux sens** :

| Stripe | Sinalite | Conséquence |
|---|---|---|
| live | sandbox | **argent débité, rien d'imprimé** ← état du 2026-07-20 |
| test | live | **impressions réelles sur de faux paiements** |
| test | sandbox | ✅ phase de test cohérente |
| live | live | ✅ production |

Il n'existe **pas d'ordre sûr** entre les deux bascules : quel que soit celui qu'on change en premier, on traverse une case rouge. Il faut donc :

1. mettre le site hors d'atteinte des clients pendant la fenêtre (ou accepter le risque en connaissance de cause) ;
2. changer les deux ;
3. vérifier avant de rouvrir.

---

## 2. Le triplet Stripe est indissociable

Trois valeurs doivent **toujours** être du même mode :

| Variable | Où la prendre |
|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe → Developers → API keys (`pk_test_` / `pk_live_`) |
| `STRIPE_SECRET_KEY` | idem (`sk_test_` / `sk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → **Webhooks** → *l'endpoint du mode visé* → `whsec_` |

**Le piège** : chaque mode a ses **propres endpoints webhook**, avec chacun son `whsec_`. Un endpoint créé en mode test **n'existe pas** en mode live. Basculer les clés sans recréer l'endpoint et sans changer le `whsec_` laisse le paiement fonctionner et la commande ne jamais se finaliser.

### Symptôme → cause

Chaque désaccord produit un symptôme **différent et trompeur** :

| Symptôme observé | Cause réelle |
|---|---|
| Erreur au moment du paiement | `pk_` et `sk_` de modes différents |
| Paiement réussi, commande reste `PENDING`, jamais `PAID` | `whsec_` du mauvais endpoint — **ressemble à un bug applicatif** |
| Paiement réussi, commande `PAID`, rien chez le fournisseur | Sinalite en sandbox |

Le deuxième est le plus coûteux en temps : tout paraît fonctionner côté client, et on cherche le défaut dans le code du webhook alors que la configuration ne correspond pas.

---

## 3. Passer Stripe en mode TEST (phase d'essai)

1. Stripe → **basculer l'interrupteur Test mode** (en haut à droite).
2. Developers → API keys → copier `pk_test_…` et `sk_test_…`.
3. Developers → Webhooks → **créer l'endpoint** s'il n'existe pas :
   - URL : `https://www.plio.ca/api/webhooks/stripe`
   - Événements : au minimum `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `checkout.session.completed`, `checkout.session.expired`
4. Copier le `whsec_…` **de cet endpoint test**.
5. Console Amplify → poser les **trois** variables → redéployer.
6. Vérifier :

```bash
node scripts/check-prelaunch.mjs   # doit annoncer « Stripe en mode TEST »
```

7. Passer une commande avec une carte de test (`4242 4242 4242 4242`), puis confirmer dans Stripe → Webhooks → **Recent deliveries** que la livraison est en **200**. Un `400` = `whsec_` incorrect.

> ⚠️ Tant que Sinalite est en sandbox, cette commande ne sera pas produite — c'est **attendu** en phase de test.

---

## 4. Passer Stripe en mode LIVE (lancement)

Identique à §3, avec l'interrupteur en mode Live et les clés `pk_live_` / `sk_live_`. **L'endpoint webhook live est à créer séparément** — celui du mode test ne compte pas.

---

## 5. Passer Sinalite en LIVE

| Variable | Sandbox | Live |
|---|---|---|
| `SINALITE_API_BASE` | `https://api.sinaliteuppy.com` | `https://liveapi.sinalite.com` |
| `SINALITE_AUTH_BASE` | *(sandbox)* | *(live)* |
| `SINALITE_CLIENT_ID` | identifiants sandbox | **identifiants live — différents** |
| `SINALITE_CLIENT_SECRET` | idem | idem |

Trois points à ne pas manquer :

1. **Les identifiants diffèrent** entre les deux environnements. Réutiliser ceux du sandbox donne un échec d'authentification, pas un message clair.
2. **`createOrder` débite le portefeuille Sinalite.** Le compte live doit être approvisionné, sinon la commande est payée chez nous et refusée chez eux — le pire des deux mondes.
3. `SINALITE_WEBHOOK_SECRET` sert à valider les mises à jour de statut de production. Sans elle, les statuts ne sont pas vérifiés.

Après bascule, vérifier via `/api/health` que le contrôle `api:sinalite` passe (il authentifie et récupère un produit).

---

## 6. Vérifier la bascule pour de vrai

La règle qui a coûté le plus cher pendant l'audit :

> **Une commande qui aboutit ne prouve pas ce qu'on croit.** Elle peut aboutir par le chemin qu'on pensait avoir quitté.

Donc, après chaque bascule, vérifier par une **observation directe** et non par l'absence de problème :

- Stripe → Webhooks → Recent deliveries → **200** (pas juste « le paiement a marché »)
- Sinalite → la commande apparaît dans le tableau de bord **live** (pas juste « la commande est PAID »)
- `node scripts/check-prelaunch.mjs` → mode annoncé conforme à l'intention

---

## 7. Ce qui n'est pas vérifiable de l'extérieur

`scripts/check-prelaunch.mjs` détecte le mode Stripe (via la clé publiable, inlinée dans le bundle client) mais **ne peut pas** vérifier :

- que `STRIPE_SECRET_KEY` est du même mode — jamais exposée, par construction ;
- que `STRIPE_WEBHOOK_SECRET` correspond à l'endpoint — un mauvais `whsec_` produit le **même** `400 Invalid signature` qu'une signature forgée, donc aucun test externe ne les distingue ;
- l'environnement Sinalite — aucune trace observable publiquement.

Ces trois-là se vérifient dans les tableaux de bord respectifs. Le script le rappelle dans sa section « NON VÉRIFIABLE D'ICI ».
