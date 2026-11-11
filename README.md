# LigneDirecte Cockpit

Reporting de prospection multicanale en direct (appels, cold email, LinkedIn), pour les SDR freelances, les agences et leurs clients.

- **Espace SDR / agence** : tous les appels, statistiques, briefs IA, relances, coach, clients.
- **Espace client** (`/portal/<id>`) : le client ne voit **que** ses appels. Il peut ajouter les siens (CSV, ajout manuel, ses propres outils).
- **Sources** :
  - appels : Minari, Aircall, Ringover (bêta), HubSpot, lemlist (bêta) ;
  - cold email : lemlist, Instantly, Smartlead, HubSpot (bêta) ;
  - LinkedIn : lemlist (bêta) ;
  - **tous les autres outils** (La Growth Machine, Waalaxy, Apollo, Brevo…) via le **webhook universel** branché dans Zapier, Make ou n8n ;
  - import CSV (appels, ou emails / LinkedIn) et ajout manuel avec enregistrement et transcription.
- **Relances** : créées automatiquement (IA ou règles) depuis les appels, les réponses email et LinkedIn, avec une date d'échéance (« rappeler en mars » → 1er mars). Récap chaque matin par email et Slack.
- **Fiche prospect** : tout l'historique d'un prospect, tous canaux et tous outils confondus.
- **IA (API Claude)** : résumé et objections de chaque appel transcrit, brief pré-meeting, coach.
- **Abonnement (Stripe)** : essai 14 jours, formules Solo et Agence.

## Stack

Next.js 15 (App Router) · PostgreSQL + Prisma · connexion par lien email (Resend) · Stripe · API Claude · stockage S3 compatible (Cloudflare R2) pour les enregistrements.

## Lancer en local

```bash
npm install
cp .env.example .env   # puis remplir AUTH_SECRET, ENCRYPTION_KEY, CRON_SECRET (voir commentaires)
npx prisma db push
npm run seed           # données de démo fictives (facultatif)
npm run dev
```

Sans `RESEND_API_KEY`, le lien de connexion s'affiche dans le terminal (en développement uniquement).

```bash
npm test               # tests d'isolation et de calcul (base locale requise)
```

## Mettre en production

1. **Base de données** : créer une base Postgres (Supabase ou Neon), copier l'URL dans `DATABASE_URL`, puis `npx prisma db push`.
2. **Hébergement** : importer le dépôt sur Vercel, renseigner toutes les variables de `.env.example`. `APP_URL` = l'adresse finale (ex. `https://app.lignedirecte.io`).
3. **Tâches planifiées** : `vercel.json` déclare `/api/cron/sync` (toutes les 10 minutes) et `/api/cron/digest` (récap des relances, en semaine vers 7 h 45 à Paris). Vercel envoie `CRON_SECRET` automatiquement. La synchro toutes les 10 minutes demande l'offre Pro de Vercel ; sur l'offre gratuite, passer à une fois par jour.
4. **Emails** : créer un compte Resend, vérifier le domaine d'envoi, renseigner `RESEND_API_KEY` et `EMAIL_FROM`.
5. **Stripe** : créer deux prix mensuels (Solo, Agence) → `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_AGENCY`. Ajouter un webhook vers `https://<APP_URL>/api/stripe/webhook` (événements `checkout.session.completed`, `customer.subscription.*`) → `STRIPE_WEBHOOK_SECRET`. Activer le portail client Stripe.
6. **IA** : `ANTHROPIC_API_KEY`. Modèle par défaut : `claude-opus-5-5` (modifiable via `AI_MODEL`).
7. **Enregistrements** : créer un bucket R2 privé, une clé d'accès, et autoriser en CORS les `PUT` depuis `APP_URL`.

## Mettre à jour la base

Les scripts de `prisma/sql/` s'exécutent dans l'ordre, une seule fois chacun, dans Supabase > SQL Editor :
`002_multicanal.sql` ajoute les emails, LinkedIn, les relances avec échéance et les alertes.

## Sécurité et cloisonnement

- Chaque lecture d'appel passe par `callScope()` (`src/lib/access.ts`) : un utilisateur de portail ne peut lire que `Call.clientId = son client`.
- Les clés API des outils sont chiffrées en AES-256-GCM (`ENCRYPTION_KEY`).
- Les numéros de téléphone ne sont pas conservés (4 derniers chiffres seulement).
- Les webhooks entrants sont authentifiés par un jeton secret propre à chaque intégration et ne font que déclencher une relecture par l'API de l'outil.
- Tests : `tests/core.test.mts`.

## À valider avec de vraies clés

| Source | État |
|---|---|
| Minari | Format des appels vérifié sur de vraies données ; l'URL de base et l'en-tête d'authentification de l'API REST sont à confirmer (`MINARI_API_BASE`, Minari > Settings > API & webhook). |
| Aircall | Endpoint `/v1/calls` standard ; transcription et résumé (option AI Assist) à vérifier. |
| HubSpot | API CRM v3 standard (jeton d'application privée, droit `crm.objects.calls.read`). |
| Ringover, lemlist, Instantly, Smartlead | Bêta : formats déduits, à valider avec une clé. |
| HubSpot (emails) | API CRM v3 standard, droit de lecture des emails à ajouter au jeton. |
| Webhook universel | Testé : formats de Zapier / Make / n8n libres, libellés d'événements des outils reconnus. |
