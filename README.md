<<<<<<< HEAD
# Deployment and Development

This workspace contains the actual app in the `nexus/` subfolder.

Scripts (run from repository root):

- `npm run dev` — runs Vite dev server for the `nexus` app (`vite --root nexus`).
- `npm run build` — builds the `nexus` app for production (`vite build --root nexus`).
- `npm run preview` — preview the production build (`vite preview --root nexus`).

If your hosting service runs `npm run build` from the repository root (e.g., Netlify, Vercel), the updated scripts will build the `nexus` app correctly.

## AI API (Gemini) setup

The browser never talks to Google directly and never sees the API key. The app calls `/api/gemini`, and a small serverless function forwards the prompt to Gemini with the key attached **server-side**.

### Local development

1. Create a `.env` file in the `nexus/` folder:

   ```
   GEMINI_API_KEY=your-real-key-here
   ```

   (The older `VITE_GEMINI_API_KEY` name still works in dev as a fallback — the key just must not be prefixed with `VITE_` anymore.)

2. `npm run dev` — the Vite dev server includes middleware that serves `/api/gemini` from `nexus/api/gemini-core.js`.

> Note: keys in `.env*` files without the `VITE_` prefix are NOT bundled into client code — that is the whole point of this setup. Never use `VITE_GEMINI_API_KEY`; anything with that prefix is publicly readable in the built JS.

### Vercel

- The function is `nexus/api/gemini.js` (Vercel picks up `api/*.js` inside the project root that contains the `vercel.json`/settings — if your Vercel project root is the repo root, set **Root Directory** to `nexus` or move `nexus/api` to `api/`).
- Add `GEMINI_API_KEY` in **Project Settings → Environment Variables**.

### Netlify

- `netlify.toml` at the repo root wires `/api/gemini` → the function in `nexus/api`.
- Add `GEMINI_API_KEY` in **Site configuration → Environment variables**.

### Data migration (existing users)

Previously saved data under the bare keys `codeSnippets` / `learningTracker` / `theme` is read automatically and rewritten under the new `nexus:`-prefixed keys on the next change. Nothing to do manually.

### Routing

The app uses client-side routing (`/ai`, `/snippets`, `/tracker`, `/settings`), so the active page survives refreshes and the browser back button works. On Netlify the SPA fallback redirect in `netlify.toml` serves `index.html` for deep links. On Vercel, add this to `vercel.json` if you deploy there:

```json
{ "rewrites": [{ "source": "/:path*", "destination": "/index.html" }] }
```

Tidying up
----------

There is a duplicate `src/` directory at the repository root. You can either:

- Delete or archive the root `src/` folder if you don't need it, or
- Move its contents into `nexus/src/` and remove the extra folder.

Security
--------

- Store the key as `GEMINI_API_KEY` (no `VITE_` prefix!) in `.env` (local) or your hosting dashboard (production). Do NOT commit real API keys.
- Keep `.env` excluded via `.gitignore` (already done).
- The client bundle contains **no** API key; `/api/gemini` is the only path to Google.
=======
# 🎯 NEXUS AI

A mini developer workspace that combines an **AI coding assistant**, a **snippet manager**, and a **learning tracker** — all in one place.

---

## 🚀 Project Goal

Build a web app where developers can:

- **Use AI assistant** for coding help  
- **Save code snippets** for quick reuse  
- **Track learning progress** with a simple dashboard  

Think of it as your personal productivity hub for coding.

---

## 🛠️ Tech Stack

- React (Vite)  
- Tailwind CSS  
- React Router  
- Context API / useReducer  
- Axios / Fetch API  
- AI API integration → Gemini 

---

## 🧩 Core Features

### 1️⃣ AI Code Helper 🤖
- Input box for coding-related questions  
- Features:
  - Prompt input  
  - AI response section  
  - Copy button for generated code  

**Examples:**  
- Explain a snippet  
- Generate a function  
- Debug simple code  

---

### 2️⃣ Snippet Manager 📂
- Add snippet (title + code)  
- View saved snippets  
- Delete snippets  

**Examples:**  
- React hook example  
- API request example  
- Sorting algorithm  

---

### 3️⃣ Learning Tracker 📈
- Add topics learned  
- Mark topics as completed  
- View progress
>>>>>>> 85d9ddb472ce82a42d0ad1abaaa228dc2217a080
