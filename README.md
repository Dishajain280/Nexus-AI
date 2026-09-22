<div align="center">

<img src="docs/banner.svg" alt="NEXUS AI — Optimize Workflow. Accelerate Learning. Empower Developers." width="100%" />

# NEXUS AI

**A centralized developer workspace — AI code helper, snippet manager, and learning tracker in one fast, local-first app.**

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-ai--tool--nexus.vercel.app-FF5733?style=for-the-badge)](https://ai-tool-nexus.vercel.app)

![React](https://img.shields.io/badge/React-19-2874A6?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Gemini](https://img.shields.io/badge/Google_Gemini-API-FF5733?logo=google&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-2874A6)
![Platform](https://img.shields.io/badge/Deployed_on-Vercel_%7C_Netlify-212F3C?logo=vercel&logoColor=white)

</div>

---

## ✨ What is NEXUS?

NEXUS replaces the three browser tabs every developer keeps open — an AI chat, a paste-bin of code snippets, and a notes file tracking what they're learning — with **one workspace**:

- 🤖 **AI Code Helper** — Gemini-powered assistant with 8 one-click prompt templates (React component, API endpoint, debug, unit test, refactor, SQL, Git workflow, Docker config), a chat-style interface, and responses rendered as real markdown — headings, lists, inline code, and syntax-fenced code blocks with a copy button.
- 💾 **Snippet Storage** — save, search, and manage code snippets with grid/list views, one-click copy, and an editor modal. Snippets can be created straight from any AI response.
- 📚 **Learning Tracker** — topics with status (pending / in progress / completed), per-topic progress sliders, sub-task checklists, a progress ring, and stat cards.
- 🏠 **Dashboard** — quick actions, recent activity feed, developer tips, keyboard shortcuts, AI prompt history, and a getting-started checklist.

**Everything is stored locally in your browser** — no account, no database, no telemetry. Your snippets and learning data never leave your machine; the only server involved is a tiny stateless proxy that keeps the Gemini API key off the client (see [Security](#-security-model)).

## 📸 Screenshots

| Landing | AI Helper |
| --- | --- |
| ![Landing page](docs/screens/01b-landing-hero.png) | ![AI Helper](docs/screens/03-ai-helper.png) |

| Dashboard | Learning Tracker |
| --- | --- |
| ![Dashboard](docs/screens/02-dashboard.png) | ![Learning Tracker](docs/screens/05-tracker.png) |

<details>
<summary>More screenshots</summary>

![Snippets](docs/screens/04-snippets.png)

![Settings](docs/screens/06-settings.png)

![Full landing page](docs/screens/01-landing-dark.png)

</details>

## 🏗️ Architecture

<div align="center">
<img src="docs/architecture.svg" alt="NEXUS AI architecture: React SPA + localStorage → serverless /api/gemini proxy → Google Gemini API" width="100%" />
</div>

**Request flow for an AI prompt:**

1. The React app `POST`s the prompt to the relative endpoint `/api/gemini` (with an `AbortController` so cancelled requests never update stale state).
2. A serverless function forwards it to Google's `generateContent` endpoint with the API key attached **server-side**, after validating method, JSON body, and prompt length (8,000-char cap).
3. The raw Gemini response passes through: `candidates` are rendered as markdown, and `finishReason` values like `SAFETY` or `RECITATION` are explained in plain language instead of failing silently.

The same proxy core (`nexus/api/gemini-core.js`) runs on **both** Vercel and Netlify through thin platform adapters, and is also mounted as Vite dev-server middleware — so dev, preview, and production behave identically.

## 🔒 Security model

- **The API key never reaches the browser.** The client bundle contains no key, no `VITE_*` reference — the browser only ever talks to `/api/gemini`.
- The key lives in a hosting-platform environment variable (`GEMINI_API_KEY`) or a git-ignored `.env` locally.
- All app state is namespaced under `nexus:` localStorage keys and never transmitted anywhere.
- User input rendered as markdown is escaped to React elements — no `dangerouslySetInnerHTML` anywhere.

## 🛠️ Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| UI | React 19 + React Router 7 | Modern concurrent React, real routing with deep links |
| Build | Vite 8 | Instant HMR, tiny production bundles |
| AI | Google Gemini API (`gemini-3-flash-preview`) | Fast, high-quality code responses |
| Hosting | Vercel (primary), Netlify (supported) | Serverless functions for the proxy on both |
| Styling | Hand-written CSS design system | Charcoal / Royal Blue / Fiery Orange palette, light + dark themes, no framework overhead |
| Storage | `localStorage` + schema normalization | Zero-backend persistence that survives schema changes |

## 🚀 Run it locally

```bash
git clone https://github.com/Dishajain280/Nexus-AI.git
cd Nexus-AI
npm install
npm run dev        # → http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (the `/api/gemini` proxy runs as dev middleware) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint |

**API key (optional locally):** create `nexus/.env` (git-ignored) with `GEMINI_API_KEY=<your key>` from [Google AI Studio](https://aistudio.google.com/apikey). Without it, everything except AI generation works, and the app explains exactly what's missing.

## ☁️ Deployment

Deployments are preconfigured for both platforms — see the full details in [`netlify.toml`](netlify.toml), [`vercel.json`](vercel.json), and [`nexus/vercel.json`](nexus/vercel.json):

- **Vercel:** root `vercel.json` builds the app (`npm run build` → `dist/`), routes `/api/gemini` to the serverless function in `api/`, and rewrites everything else to `index.html` for SPA deep links.
- **Netlify:** `netlify.toml` does the same via the function in `nexus/api/gemini.mjs`.
- Either way: set `GEMINI_API_KEY` in the platform's environment-variable settings.

## 🧭 Roadmap

- [ ] Multi-turn AI context — send recent chat history so follow-up questions work
- [ ] Streaming responses (token-by-token) with stop / regenerate
- [ ] Snippet tags + tag filtering
- [ ] Cloud sync (opt-in) with accounts — local-first stays the default
- [ ] Unit tests (Vitest) + CI pipeline
- [ ] PWA support for offline use

## 🎓 What I learned

- **Serverless proxies are the right shape for API keys.** The first version shipped the key in a `VITE_*` variable — visible to anyone who opened DevTools. Moving to a stateless serverless function (with validation and error passthrough) fixed it, and making the same core run on Vercel, Netlify, *and* the Vite dev server taught me a lot about adapter design.
- **Git submodules bite when you don't know they exist.** This repo once deployed an empty `nexus/` folder because the app directory was accidentally committed as an embedded-repo gitlink — the internet's least-helpful error (`Cannot resolve entry module index.html`) turned into a deep dive into git tree entries, `git archive`, and CI-from-first-principles debugging.
- **Persistence needs a schema.** localStorage "works" until a saved topic from an older version has no `progress` field and the progress bar renders `width: undefined%`. A normalization/migration layer on load made the app tolerant of its own history.
- **Hand-rolling a markdown renderer** (headings, lists, code fences, inline formatting, XSS-safe output as React elements) taught me more about parsing than dropping in a library would have.
- **Honest products are better products.** Early versions had invented stats ("10K+ developers!") on the landing page. Replacing them with the app's real, live numbers made the project more credible — and made me think about what the app can actually prove.

## 📄 License

Released under the [MIT License](LICENSE).

---

<div align="center">
<sub>Built with ⚡ by <a href="https://github.com/Dishajain280">Dishajain280</a> · Charcoal <code>#212F3C</code> · Royal Blue <code>#2874A6</code> · Fiery Orange <code>#FF5733</code></sub>
</div>
