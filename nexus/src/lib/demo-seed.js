// Demo mode: visiting /?demo=1 (or /home?demo=1 …) seeds realistic example
// data into localStorage so documentation screenshots show the product
// working with real content. The banner marks it as demo data, and
// localStorage.clear() (Settings → Clear All Data) removes everything.
// It is a documentation tool, not a fake-usage feature.

const DAY = 86400000;
const at = (daysAgo, hour = 10) => {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};

export const DEMO_SNIPPETS = [
  {
    id: "demo-s1",
    name: "Debounce function",
    code: "const debounce = (fn, wait = 300) => {\n  let t;\n  return (...args) => {\n    clearTimeout(t);\n    t = setTimeout(() => fn(...args), wait);\n  };\n};",
    tags: ["js", "utils"],
  },
  {
    id: "demo-s2",
    name: "Flatten nested array",
    code: "const flatten = (arr) =>\n  arr.reduce((acc, v) =>\n    acc.concat(Array.isArray(v) ? flatten(v) : v), []);",
    tags: ["js", "algorithms"],
  },
  {
    id: "demo-s3",
    name: "Fetch with retry",
    code: "async function fetchRetry(url, tries = 3) {\n  for (let i = 0; i < tries; i++) {\n    try {\n      const res = await fetch(url);\n      if (!res.ok) throw new Error(res.status);\n      return res.json();\n    } catch (e) {\n      if (i === tries - 1) throw e;\n      await new Promise(r => setTimeout(r, 2 ** i * 500));\n    }\n  }\n}",
    tags: ["js", "network"],
  },
  {
    id: "demo-s4",
    name: "Flexbox centering",
    code: ".center {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}",
    tags: ["css"],
  },
  {
    id: "demo-s5",
    name: "React useState counter",
    code: "function Counter() {\n  const [n, setN] = React.useState(0);\n  return <button onClick={() => setN(n + 1)}>{n}</button>;\n}",
    tags: ["react"],
  },
  {
    id: "demo-s6",
    name: "SQL self join",
    code: "SELECT e.name, m.name AS manager\nFROM employees e\nJOIN employees m ON e.manager_id = m.id;",
    tags: ["sql"],
  },
];

export const DEMO_TOPICS = [
  {
    id: "demo-t1",
    name: "React hooks deep-dive",
    status: "incomplete",
    notes: "## Closure trap\nsetN(n + 1) vs setN(n => n + 1) — functional updates avoid stale closures when React batches events.",
    date: at(9).toLocaleDateString(),
    learnedAt: at(1).toISOString(),
    subTasks: [
      { id: "demo-st1", text: "useState basics", done: true },
      { id: "demo-st2", text: "useEffect cleanup", done: true },
      { id: "demo-st3", text: "custom hooks", done: false },
    ],
    progress: 60,
  },
  {
    id: "demo-t2",
    name: "CSS Grid layouts",
    status: "completed",
    notes: "grid-template-areas reads like the ASCII art of your layout.",
    date: at(14).toLocaleDateString(),
    learnedAt: at(6).toISOString(),
    subTasks: [
      { id: "demo-st4", text: "tracks + fr units", done: true },
      { id: "demo-st5", text: "grid-template-areas", done: true },
    ],
    progress: 100,
  },
  {
    id: "demo-t3",
    name: "Async patterns in JS",
    status: "incomplete",
    notes: "Promise.all fails fast; allSettled never does.",
    date: at(6).toLocaleDateString(),
    learnedAt: at(3).toISOString(),
    subTasks: [
      { id: "demo-st6", text: "event loop", done: true },
      { id: "demo-st7", text: "Promise combinators", done: false },
    ],
    progress: 45,
  },
  {
    id: "demo-t4",
    name: "SQL joins",
    status: "pending",
    notes: "",
    date: at(0).toLocaleDateString(),
    learnedAt: at(0).toISOString(),
    subTasks: [],
    progress: 0,
  },
];

export const DEMO_AI_HISTORY = [
  { id: "demo-h1", prompt: "Save a snippet named 'Fetch with retry', then show my other JS snippets", time: "10:38:22", at: at(0, 9).getTime() },
  { id: "demo-h2", prompt: "Explain the event loop with a diagram", time: "16:12:09", at: at(1, 16).getTime() },
  { id: "demo-h3", prompt: "Write a unit test for the debounce function", time: "09:44:51", at: at(2, 9).getTime() },
  { id: "demo-h4", prompt: "Why does Promise.all reject faster than allSettled?", time: "20:03:17", at: at(3, 20).getTime() },
  { id: "demo-h5", prompt: "Refactor my flexbox centering for RTL layouts", time: "11:29:44", at: at(5, 11).getTime() },
  { id: "demo-h6", prompt: "What is grid-template-areas?", time: "14:58:02", at: at(8, 15).getTime() },
  { id: "demo-h7", prompt: "Debug: Cannot read properties of undefined (reading 'map')", time: "10:11:37", at: at(12, 10).getTime() },
  { id: "demo-h8", prompt: "Optimize this SQL self join", time: "17:40:26", at: at(19, 18).getTime() },
];

export const DEMO_CHAT = [
  {
    role: "user",
    content: "Save a snippet named 'Fetch with retry' with exponential backoff, then show me my other JS snippets.",
  },
  {
    role: "assistant",
    content: "",
    toolEvents: [
      { name: "save_snippet", ok: true },
      { name: "search_snippets", ok: true },
    ],
  },
  {
    role: "assistant",
    // Compact on purpose: the docs screenshot must show the whole exchange
    // (prompt → tool chips → markdown) in one viewport, no scrolling.
    content:
      "Done — saved **Fetch with retry** and searched your library.\n\n## Your other JS snippets\n\n- **Debounce function** (`js`, `utils`)\n- **Flatten nested array** (`js`, `algorithms`)\n\nThe retry wrapper uses exponential backoff — each retry waits `2^i * 500ms`:\n\n```js\nawait new Promise(r => setTimeout(r, 2 ** attempt * 500));\n```\n\nWant me to add a timeout with `AbortController` as well?",
  },
];

// Idempotent: only seeds when the demo flag is absent. Call before render.
export function maybeSeedDemoData() {
  try {
    if (!/[?&]demo=1/.test(window.location.search)) return false;
    if (localStorage.getItem("nexus:demoSeeded") === "1") return true;
    localStorage.setItem("nexus:codeSnippets", JSON.stringify(DEMO_SNIPPETS));
    localStorage.setItem("nexus:learningTracker", JSON.stringify(DEMO_TOPICS));
    localStorage.setItem("nexus:aiHistory", JSON.stringify(DEMO_AI_HISTORY));
    localStorage.setItem("nexus:chatMessages", JSON.stringify(DEMO_CHAT));
    localStorage.setItem(
      "nexus:threads",
      JSON.stringify([
        {
          id: "demo-thread-1",
          title: "Save a snippet named 'Fetch with retry' with exponential backoff, then show me my other JS snippets",
          messages: DEMO_CHAT,
          at: at(0, 9).toISOString(),
        },
      ]),
    );
    localStorage.setItem("nexus:demoSeeded", "1");
    return true;
  } catch {
    return false;
  }
}
