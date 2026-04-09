<div align="center">
  <h1 style="color: maroon">Lumina Inventory System</h1>
  <p>A resilient, offline-capable inventory management system optimized for the Virginia Tech Food Pantry.</p>
</div>

## Features

- **Offline-First Capabilities:** Works flawlessly in network-denied environments.
- **Smart Data Syncing:** Changes made offline automatically push to Firebase when connection is restored.
- **AI-Powered Photo Stock Management:** Identify and categorize items using Gemini API from photos.
- **Excel Vendor Invoice Import:** Batch load massive catalogs of donations securely from SheetJS and XLSX sources. 
- **Accessible & Frictionless:** Zero-barcodes and extremely easy lookup for non-technical volunteers.

## Run Locally

**Prerequisites:** Node.js v20+

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set the `GEMINI_API_KEY` in your environment or `.env` files to utilize AI.
3. Run the development server locally:
   ```bash
   npm run dev
   ```

## Google Cloud Deployment

This repository is pre-configured for **Google Cloud App Engine** (Node.js 20). 

1. Ensure the Google Cloud SDK is installed and authenticated.
2. Build the Vite bundles required for production:
   ```bash
   npm run build
   ```
3. Deploy the application to the active GCP project using `app.yaml`:
   ```bash
   gcloud app deploy
   ```
   *The `server/index.js` file handles statically serving the web application and handles SPA routing via Express.*

## Code Architecture

- Setup around React 19 + Vite 6
- Fully built out `Tailwind + Lucide UI`
- State Management and Backend stored with Firebase Web SDK v12.
