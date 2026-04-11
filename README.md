# Bloom
https://bloom-e18dd.web.app/
Inventory management for the Virginia Tech Food Pantry: **Open-Hours** and **Grocery** programs, with optional AI-assisted intake, checkpoints, and Google Sheets export.

## Prerequisites

- Node.js 20+
- A Firebase project (Authentication with Google, Firestore)
- Optional: Google Gemini API key for voice, photo, chat, OCR, and spreadsheet normalization
- Optional: Google Apps Script web app URL for spreadsheet logging

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Fill in `.env` (see [`.env.example`](.env.example)):

   - **`GEMINI_API_KEY`** — Required for AI features in production builds unless you inject `window.__RUNTIME_GEMINI_API_KEY__` at runtime (wired at build time via Vite; see `vite.config.ts`).
   - **`VITE_SHEETS_WEBHOOK_URL`** — Optional. If set, inventory actions are queued and POSTed to your Apps Script endpoint (`src/lib/sheetsSync.ts`).

4. Firebase client configuration is read from [`firebase-applet-config.json`](firebase-applet-config.json) at build time. This file contains **public** web client settings only; do not put server secrets there. Keep [`.firebaserc`](.firebaserc) `default` in sync with `projectId` in that JSON when deploying Hosting (this repo uses **`ominiscope33`** unless you change both files to another project you control).

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Vite dev server (port 3000) |
| `npm run build` | Production bundle to `dist/` |
| `npm run preview` | Preview production build |
| `npm run start` | Serve app with Express (`server/index.js`) |
| `npm run lint` | Typecheck with `tsc --noEmit` |
| `npm run deploy:firebase` | Deploy Hosting + Firestore rules (uses local `firebase-tools`; run `firebase login` once) |
| `npm run deploy` | `npm run build` then `deploy:firebase` |

## Features

- **Inventory table**
  - Search by name, vendor, or category; filter by program (**Open-Hours** / **Grocery**) and category (including uncategorized).
  - **Low stock** banner and filter to rows at or below the threshold.
  - **Missing details** flags rows missing vendor, category, or pack weight; filter to focus on them.
  - Inline edits for quantity and pack weight; transfer between programs, delete, merge duplicates, rollover checkpoints, and history.
- **Charts**
  - Dashboard-style summaries (e.g. category breakdowns) for the current inventory snapshot.
- **Guest mode**
  - **Continue as guest** keeps inventory **only on this device** (`localStorage`). No Firestore sync until you sign in with Google.
  - Rollover checkpoints are saved locally; signing in can migrate offline rows to the cloud.
- **Sign in with Google**
  - Real-time Firestore sync for the shared inventory collection; checkpoints written to Firestore.
- **Add stock**
  - **Voice** — speak an intake line, review, then save.
  - **Photo** — restock or consume against a matched line (requires `GEMINI_API_KEY`).
  - **Manual entry** with duplicate suggestions.
  - **Invoice OCR** and **Excel import** for batch adds (bulk imports are not each line on the undo stack).
- **Remove stock**
  - Photo consume; bulk remover for pasted or spoken lists.
- **Undo / redo**
  - Session-level undo for edits, adds, deletes, and bulk quantity changes (header buttons or **Ctrl+Z** / **Ctrl+Y** / **Ctrl+Shift+Z**). Merge and transfer are not in the undo stack in v1.
- **Bloom AI (chat)**
  - Floating assistant (bottom-right) answers questions about the current inventory snapshot when `GEMINI_API_KEY` is set.
- **Google Sheets (optional)**
  - If `VITE_SHEETS_WEBHOOK_URL` is set, changes are queued and POSTed to your Apps Script webhook.
- **Help**
  - In-app **Help** in the header documents the above in more detail.

## Architecture

- **UI**: React 19, Vite 6, Tailwind CSS 4, Lucide icons, Motion, Recharts, Sonner toasts.
- **Data (signed in)**: Firebase Auth (Google), Firestore with persistent local cache, real-time `onSnapshot` on the `inventory` collection.
- **Data (guest)**: No Firestore listener; state under `bloom_offline_inventory` in `localStorage` only.

## Deployment (Firebase Hosting)

The app is configured for static hosting with [`firebase.json`](firebase.json) (`public`: `dist`, SPA rewrite to `index.html`). [`.firebaserc`](.firebaserc) should target the **same** Firebase project as [`firebase-applet-config.json`](firebase-applet-config.json) (this repo defaults to **`ominiscope33`**).

### Hosted URL vs localhost: who uses the cloud?

- **Firebase Hosting** is only the static delivery of the web app (HTML/JS/CSS). It does not change guest vs signed-in behavior.
- **Signed in with Google** (on **localhost** or your **`*.web.app`** / **`*.firebaseapp.com`** URL): inventory and checkpoints use **Firestore** in your Firebase project—same behavior everywhere, as long as Authentication authorized domains include that host.
- **Guest mode** (on localhost **or** the hosted site): data stays **in the browser only** (local storage on that device). Nothing is “hosted” in the cloud for guest inventory; use **Sign in with Google** when you want cloud sync.

If Google sign-in fails on the deployed URL, add your Hosting domains under **Authentication → Settings → Authorized domains** in the Firebase console.

### One-time: Firebase Console

Do this in the **same** Firebase project as `firebase-applet-config.json`:

1. **Authentication → Sign-in method**: Enable **Google**.
2. **Authentication → Settings → Authorized domains**: Add your hosting hostnames, including:
   - `localhost` (for local dev with Google sign-in)
   - `ominiscope33.web.app` and `ominiscope33.firebaseapp.com` (default Hosting URLs for the project ID in `firebase-applet-config.json`)
   - Any custom domain you attach under Hosting.

Without the Hosting domains, Google sign-in can fail on the deployed site.

### CLI and log in

This repo includes **`firebase-tools`** as a dev dependency, so you do **not** need a global `firebase` install. After `npm install`, the CLI is available as `npx firebase` or via the scripts below.

```bash
npx firebase login
npx firebase use ominiscope33
```

(Alternatively: `npm install -g firebase-tools` if you prefer a global `firebase` command.)

### Build and deploy

Set `GEMINI_API_KEY` (and optionally `VITE_SHEETS_WEBHOOK_URL`) in the environment before `npm run build` so they are inlined into the bundle.

```bash
npm run build
npm run deploy:firebase
```

`deploy:firebase` runs `firebase deploy --only hosting,firestore:rules`. To build and deploy in one step:

```bash
npm run deploy
```

### CI (GitHub Actions)

The workflow [`.github/workflows/firebase-hosting.yml`](.github/workflows/firebase-hosting.yml) builds on pushes to `main` and deploys Hosting when `FIREBASE_TOKEN` is set.

1. Locally: `firebase login:ci` and store the token as a repository secret **`FIREBASE_TOKEN`**.
2. Optionally add **`GEMINI_API_KEY`** and **`VITE_SHEETS_WEBHOOK_URL`** as repository secrets so production builds include AI and Sheets features.

## Deployment (Google App Engine, optional)

The repo includes `app.yaml` and [`server/index.js`](server/index.js) for static hosting and SPA fallback.

```bash
npm run build
gcloud app deploy
```

Ensure environment variables required at **build** time (e.g. `GEMINI_API_KEY`) are set in your CI or Cloud Build config.

## Help

Use the **Help** button in the app header for in-product documentation of each feature.
