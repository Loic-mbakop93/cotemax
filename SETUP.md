# CoteMax – Guide de déploiement

Site de comparaison de cotes · Coupe du Monde 2026 · Ciblant le marché camerounais

---

## 1. Supabase – Schéma

Dans le SQL Editor de votre projet Supabase, exécuter **`supabase/cotemax_schema.sql`**.

Cela crée :
- `matches` – les matchs récupérés depuis The Odds API
- `bookmakers` – les 11 bookmakers avec leurs liens affiliés
- `odds_snapshots` – les cotes historisées (snapshot toutes les 5 min)
- `latest_odds` (view) – dernière cote par match × bookmaker

---

## 2. Edge Function – fetch-odds

```bash
# Déployer la fonction
supabase functions deploy fetch-odds

# Configurer le secret API
supabase secrets set ODDS_API_KEY=1147caef60217f0072de7f20750ad60c
```

### Déclencher toutes les 5 minutes (Supabase Cron)

Dans Supabase Dashboard → **Database → Extensions** : activer `pg_cron`.

Puis dans SQL Editor :

```sql
select cron.schedule(
  'fetch-odds-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url    := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/fetch-odds',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  )
  $$
);
```

Ou tester manuellement :
```bash
supabase functions invoke fetch-odds
```

---

## 3. Frontend – Variables d'environnement

Créer un fichier `.env.local` :

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

```bash
npm run dev      # développement local
npm run build    # build production
```

---

## 4. Cloudflare Pages – Déploiement

1. Connecter le dépôt GitHub dans Cloudflare Pages
2. Build command : `npm run build`
3. Output directory : `dist`
4. Ajouter les variables d'environnement (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
5. `wrangler.jsonc` est déjà configuré (SPA fallback via 404.html)

---

## 5. Liens affiliés – À personnaliser

Mettre à jour les URLs dans la table `bookmakers` (colonne `affiliate_url`) avec vos vrais liens d'affiliation :

| Bookmaker   | URL à remplacer           |
|-------------|---------------------------|
| 1xBet       | https://1xbet.cm          |
| Betway      | https://betway.cm         |
| Bet365      | https://bet365.cm         |
| Melbet      | https://melbet.cm         |
| Paripesa    | https://paripesa.cm       |
| betPawa     | https://betpawa.cm        |
| BetWinner   | https://betwinner.cm      |
| premierBet  | https://premierbet.cm     |
| Linebet     | https://linebet.cm        |
| Betandyou   | https://betandyou.cm      |
| Megapari    | https://megapari.cm       |

---

## Architecture

```
src/
  App.jsx              – Router (Home + MatchDetail)
  components/
    Topbar.jsx         – Barre de navigation
  pages/
    Home.jsx           – Liste des matchs par date + meilleures cotes
    MatchDetail.jsx    – Tableau de comparaison complet + boutons "Parier →"
  lib/
    supabase.js        – Client Supabase
    oddsApi.js         – Helpers : fetch matchs, cotes, formatage

supabase/
  cotemax_schema.sql   – Schéma complet (tables + RLS + données initiales)
  functions/
    fetch-odds/
      index.ts         – Edge Function : The Odds API → Supabase
```
