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

## Deployment

The production site deploys to **Vercel** (`ai-tool-nexus.vercel.app`). Netlify is also fully supported.

### Vercel (current)

- **Framework preset:** Other
- **Build command:** `npm run build` (from `vercel.json`)
- **Output directory:** `dist` (from `vercel.json`)
- **API:** `vercel.json` rewrites `/api/gemini` → root `api/gemini.js` → shared core `nexus/api/gemini-core.js`
- **SPA:** the catch-all rewrite serves `index.html` for deep links like `/ai` and `/snippets`
- **Environment variable:** set `GEMINI_API_KEY` in the Vercel dashboard
  (Project → Settings → Environment Variables) — never commit it; `.env` is git-ignored

> If the Vercel project's **Root Directory** is set to `nexus/` instead of the
> repo root, `nexus/vercel.json` + `nexus/api/gemini.mjs` handle routing the
> same way. Keep **Root Directory unset** for the default setup.

### Netlify (alternative)

Config lives in `netlify.toml`:

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Node version:** 22 (set via `NODE_VERSION`)
- **API:** `/api/gemini` → Netlify function `nexus/api/gemini.mjs`
  (set the `GEMINI_API_KEY` environment variable in the Netlify dashboard)

> Note: this repo previously tracked `nexus/` as an embedded git repository
> (gitlink), which deployed as an empty folder and broke builds with
> `[UNRESOLVED_ENTRY] Cannot resolve entry module index.html.` The app files
> are now committed normally.
