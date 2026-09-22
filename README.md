# NEXUS AI — Deployment & Development

The actual application lives in the **`nexus/`** folder (single Vite + React app).
The repository root contains only deployment/config files.

## Local development

```bash
npm install        # once, at the repo root
npm run dev        # Vite dev server on http://localhost:5173
```

Scripts (defined in the root `package.json`):

- `npm run dev` — dev server (`cd nexus && vite`)
- `npm run build` — production build (`cd nexus && vite build --outDir ../dist`)
- `npm run preview` — serve the production build locally
- `npm run lint` — ESLint

## Deployment (Netlify)

Config lives in `netlify.toml`:

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Node version:** 22 (set via `NODE_VERSION`)
- **API:** `/api/gemini` → Netlify function `nexus/api/gemini.mjs`
  (set the `GEMINI_API_KEY` environment variable in the Netlify dashboard —
  never commit it; `.env` is git-ignored)

Vercel instead: build command `npm run build`, output directory `dist`,
and `nexus/api/gemini.js` is auto-detected as the `/api/gemini` serverless function.

> Note: this repo previously tracked `nexus/` as an embedded git repository
> (gitlink), which deployed as an empty folder and broke builds with
> `[UNRESOLVED_ENTRY] Cannot resolve entry module index.html.` The app files
> are now committed normally.
