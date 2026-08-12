# Questions techniques à Sinalite — webhook « Status Update Callback »

> Brouillon préparé le 2026-08-10. **À envoyer par Patrick**, pas par l'agent.
> Compte API : `democratik`. Portail : https://apifrontend.sinaliteuppy.com

## Pourquoi ces questions

Le champ **Status Update Callback** de la page *Account* n'accepte qu'une URL.
Ni `documentation.html` ni `tutorial.php` ne décrivent ce que Sinalite envoie à
cette URL — ni le format du corps, ni la moindre authentification.

Or notre récepteur (`src/app/api/webhooks/sinalite/route.ts`) est **fail-closed
en production** : sans en-tête de signature valide, il répond `401`. Enregistrer
l'URL sans savoir ce qui arrive produirait des 401 en boucle, et les mises à
jour de statut seraient perdues en silence.

En attendant, le cron `sinalite-reconcile` couvre par sondage. Rien n'est cassé ;
on paie simplement la latence du cron au lieu d'un push.

---

## Le courriel

**Objet :** API — Status Update Callback: payload format and authentication

Hello,

We're integrating the Sinalite API (account `democratik`) and would like to
enable the **Status Update Callback** under Account → Web Hooks. Before we point
it at our production endpoint, we need to know how to authenticate the incoming
requests, since our receiver currently rejects anything it cannot verify.

Four questions:

1. **Authentication.** Does Sinalite send any signature or shared-secret header
   with the callback (for example `x-sinalite-signature`, an HMAC of the raw
   body, or a static bearer token)? If so, where is the secret configured — we
   only see a URL field on the Account page.

2. **Query parameters.** If there is no signature mechanism, will Sinalite
   preserve query parameters in the registered URL? We would register
   `https://www.plio.ca/api/webhooks/sinalite?k=<secret>` and validate that
   value. Are query strings kept verbatim on every callback?

3. **Payload.** Could you share the JSON body of a status update, including the
   full list of possible `status` values? We want to parse it tolerantly rather
   than guess — we already had an outage caused by an unexpected carrier value
   (Canpar) that does not appear in your documented shipping method list.

4. **Retries.** What is the retry policy if our endpoint returns a non-2xx
   response, and from which IP addresses do callbacks originate? We can
   allow-list them if that is the recommended approach.

Thank you,
Patrick Thauvette — Plio

---

## Ce qu'on fait de chaque réponse

| réponse | action côté Plio |
|---|---|
| signature HMAC existe | on garde le récepteur tel quel, on pose le secret |
| secret en query accepté | on ajoute la lecture du paramètre en plus de l'en-tête |
| aucune authentification possible | ne PAS enregistrer l'URL — rester sur le cron, et documenter le récepteur comme non branché |
| liste d'IP fournie | filtrage en amont, en complément et non en remplacement |

⚠️ La docstring de `src/lib/webhooks/sinalite-signature.ts` **affirme** que
« Sinalite supporte 2 modes » (HMAC et bearer partagé). Rien au portail ne le
confirme, et cette affirmation est antérieure à toute vérification. À corriger
ou à confirmer selon la réponse — un commentaire faux sur le chemin des statuts
de commande finit par être cru.
