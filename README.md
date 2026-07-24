# What's for Dinner

A weekly meal planner that reads the weather, finds the right recipe, and puts dinner on your calendar. Cold rain on Thursday? It suggests a braise. Sunny and 88° on Saturday? Grill night.

Built with React + Vite, hand-rolled CSS (no framework), Firebase (Auth + Firestore), Open-Meteo, Spoonacular (proxied through a Netlify Function), and the Google Calendar API. Hosted on Netlify.

## How it works

- **The weekly spread** — all 7 days as a printed-menu-card layout. Each day shows a weather stamp (Open-Meteo forecast), the *why* of the suggestion ("soup weather", "grill weather"), and the planned dinner. Drag meals between days, or use the Move menu on a phone.
- **Suggestions** — the day's high temp + precipitation map to cooking categories (cold & wet → soup/stew/braise; hot & dry → grill/salad/cold prep). Suggestions draw from your saved recipes first, then the built-in house collection of 18 hand-written dinners.
- **Your recipe book** — add your own recipes (structured ingredients so the grocery list can merge them), edit or delete them under Recipes → My recipes, fill whole weeks from them with "Fill from my recipes," and swap them onto any night.
- **Takeout nights** — every day's Suggest/Swap menu includes "Takeout…": a weather-aware idea deck (ramen on rainy nights, poke in a heat wave) you can accept or pass on. Takeout nights skip the grocery list and sync to the calendar as a night off.
- **Recipe search** — Spoonacular search by name, cuisine, diet, or "use what I have" ingredients mode. The API key lives only in a Netlify Function (`netlify/functions/spoonacular.mts`) — it never ships to the browser. Without a key, search gracefully falls back to the house collection.
- **Grocery list** — compiled from the week's plan with quantities merged across recipes (12 garlic cloves, not three separate lines), manual check-off, extra items, and a print stylesheet.
- **Calendar sync** — "Sync to Calendar" writes each planned dinner as an event (with a prep-time reminder) and re-syncing replaces the app's own events instead of duplicating. "Check busy nights" reads your calendar and flags evenings that already have plans.
- **Accounts** — Firebase email/password + Google sign-in. Signed out (or with no Firebase config at all) the app runs in **notebook mode**: everything persists to localStorage, and your local week is migrated up the first time you sign in.

Tip: append `?demo=1` to the URL to see a varied demo forecast without granting location access.

## Local development

```bash
npm install
cp .env.example .env   # fill in what you have; the app degrades gracefully
npx netlify dev        # serves Vite + the Spoonacular function proxy
# or: npm run dev      # app only — recipe search uses the house collection
```

## Configuration (all optional, each unlocks a feature)

Set these as Netlify environment variables (Site configuration → Environment variables) and in local `.env`:

| Variable | Unlocks | Where to get it |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Accounts + cross-device sync | Firebase console → Project settings → Your apps → Web app config |
| `VITE_GOOGLE_CLIENT_ID` | Google Calendar sync | GCP console → APIs & Services → Credentials → OAuth 2.0 Client ID (Web application) |
| `SPOONACULAR_API_KEY` | Live recipe search | [spoonacular.com/food-api](https://spoonacular.com/food-api) (free tier) — **server-side only, no `VITE_` prefix** |

### Firebase setup

1. Reuse project `meal-planning-7468a` or create a new one at [console.firebase.google.com](https://console.firebase.google.com).
2. Enable **Authentication** → Sign-in methods → *Email/Password* and *Google*.
3. Add your Netlify domain under Authentication → Settings → **Authorized domains**.
4. Enable **Cloud Firestore** (not Realtime Database) and publish the rules in [`firestore.rules`](firestore.rules).
5. Project settings → Your apps → add a Web app → copy the config values into the `VITE_FIREBASE_*` variables.

### Google Calendar OAuth setup

In the **same GCP project** that backs Firebase:

1. Enable the **Google Calendar API** (APIs & Services → Library).
2. Configure the OAuth consent screen: External, add yourself as a **test user** (skips verification).
3. Create an **OAuth Client ID** → Web application. Add Authorized JavaScript origins:
   - `https://<your-site>.netlify.app` (exact match — `https://`, no trailing slash)
   - `http://localhost:5173` and `http://localhost:8888` for dev
4. Put the client ID in `VITE_GOOGLE_CLIENT_ID`.

No client secret is needed — the app uses the Google Identity Services token flow entirely in-browser.

### Deploying

Pushes to the production branch build automatically once the repo is connected to Netlify (`netlify.toml` holds the build settings). After the first deploy, double-check the OAuth origins above match the live URL exactly, or calendar sync will fail silently.

## Project layout

```
netlify/functions/spoonacular.mts   # keyed proxy → api.spoonacular.com
src/
  lib/        # dates, weather+moods, suggestions, grocery merge, calendar, storage
  context/    # auth (Firebase or notebook mode), settings, toasts
  hooks/      # usePlan, useWeather, useSavedRecipes
  components/ # day card, weather badge, recipe card/detail, modals
  views/      # WeekView (the spread), RecipesView, GroceryView
  styles/     # tokens.css (design system), base.css, app.css
```
