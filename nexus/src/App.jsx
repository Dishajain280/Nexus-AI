import { useState, useEffect, useRef, useCallback, useMemo, Component } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
} from "react-router-dom";
import "./index.css";
import "./App.css";
import {
  storageKeys,
  isStorageAvailable,
  readTheme,
  loadList,
  parseList,
  safeSave,
  clearAppData,
  uid,
  normalizeSnippet,
  normalizeTopic,
  MAX_CHAT_MESSAGES,
  readJSON,
} from "./lib/storage.js";
import { parseSegments, extractFirstCodeBlock } from "./lib/markdown.js";
import { semanticSearch } from "./lib/semantic.js";

/* ================================================================
   Toasts
   ================================================================ */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message, opts = {}) => {
      const id = uid();
      const toast = { id, message, kind: opts.kind || "info", action: opts.action };
      setToasts((prev) => [...prev.slice(-2), toast]);
      if (!opts.action) {
        timersRef.current.set(
          id,
          setTimeout(() => dismissToast(id), opts.duration || 3500),
        );
      }
      return id;
    },
    [dismissToast],
  );

  useEffect(
    () => () => { for (const t of timersRef.current.values()) clearTimeout(t); },
    [],
  );

  return { toasts, showToast, dismissToast };
}

function ToastRegion({ toasts, onDismiss }) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.message}</span>
          {t.action && (
            <span className="toast-actions">
              <button onClick={() => { t.action.onClick(); onDismiss(t.id); }}>
                {t.action.label}
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ================================================================
   Error Boundary — a render error must never white-screen the app
   ================================================================ */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("NEXUS render error:", error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary-icon" aria-hidden="true">💥</div>
        <h1>Something went wrong</h1>
        <p>
          NEXUS hit an unexpected error. Your saved snippets and topics are
          safe in this browser — reloading usually fixes it.
        </p>
        <pre className="error-boundary-details">
          {String(this.state.error?.message || this.state.error)}
        </pre>
        <div className="error-boundary-actions">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload NEXUS
          </button>
          <button className="btn btn-secondary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}

/* ================================================================
   Accessible Confirm Dialog
   ================================================================ */
function ConfirmDialog({ dialog, onConfirm, onCancel }) {
  const confirmRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!dialog) return;
    confirmRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialog, onCancel]);

  if (!dialog) return null;
  return (
    <div className="modal-overlay" ref={overlayRef}
      onMouseDown={(e) => { if (e.target === overlayRef.current) onCancel(); }}>
      <div className="modal" role="alertdialog" aria-modal="true"
        aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <h3 id="confirm-title">{dialog.title}</h3>
        <p id="confirm-message" className="modal-body">{dialog.message}</p>
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="danger" ref={confirmRef} onClick={onConfirm}>
            {dialog.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Snippet Modal
   ================================================================ */
// Normalize a comma-separated tag string (or array) into a clean tag list.
const parseTags = (value) => {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(list.map((t) => String(t).trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean))].slice(0, 8);
};

function SnippetModal({ snippet, onClose, onSave }) {
  const [name, setName] = useState(snippet?.name || "");
  const [code, setCode] = useState(snippet?.code || "");
  const [tags, setTags] = useState((snippet?.tags || []).join(", "));
  const nameRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!snippet) return;
    nameRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [snippet, onClose]);

  if (!snippet) return null;
  return (
    <div className="modal-overlay" ref={overlayRef}
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="snippet-modal-title">
        <h3 id="snippet-modal-title">Edit Snippet</h3>
        <div className="modal-body">
          <label className="form-field">
            <span>Name</span>
            <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSave(snippet.id, name.trim(), code, tags); }} />
          </label>
          <label className="form-field">
            <span>Code</span>
            <textarea value={code} onChange={(e) => setCode(e.target.value)} rows="10" spellCheck="false" />
          </label>
          <label className="form-field">
            <span>Tags</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSave(snippet.id, name.trim(), code, tags); }}
              placeholder="react, css, algorithms" />
            <small className="form-hint">Comma-separated — used for filtering on the Snippets page</small>
          </label>
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => onSave(snippet.id, name.trim(), code, tags)}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Landing Page
   ================================================================ */
const FEATURES = [
  { icon: "💾", title: "Snippet Storage", desc: "Save, search, and organize code snippets with instant copy-to-clipboard and inline editing." },
  { icon: "🤖", title: "AI Code Helper", desc: "Generate components, debug errors, and explore patterns with Gemini-powered assistance." },
  { icon: "📚", title: "Learning Tracker", desc: "Track topics with status, progress bars, sub-tasks, and overall completion — never lose momentum." },
  { icon: "📊", title: "Analytics Dashboard", desc: "See at a glance how many snippets you've saved and your learning progress across topics." },
];

function LandingPage() {
  const navigate = useNavigate();
  // State-driven so the toggle icon re-renders immediately (bug: stale icon).
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || readTheme() || "dark",
  );
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("nexus:theme", JSON.stringify(next));
    } catch {
      // private mode — theme just won't persist
    }
  };
  // Live, honest stats from this browser's own storage — no invented numbers.
  const [liveStats] = useState(() => {
    if (!isStorageAvailable()) return { snippets: 0, topics: 0, progress: 0 };
    const snips = loadList([storageKeys.snippets, "codeSnippets"], normalizeSnippet);
    const topics = loadList([storageKeys.tracker, "learningTracker"], normalizeTopic);
    const completed = topics.filter((t) => t.status === "completed").length;
    return {
      snippets: snips.length,
      topics: topics.length,
      progress: topics.length ? Math.round((completed / topics.length) * 100) : 0,
    };
  });

  return (
    <div className="landing">
      <nav className="landing-nav" aria-label="Landing navigation">
        <div className="logo">
          <span className="logo-mark" aria-hidden="true">🚀</span>
          NEXUS
        </div>
        <div className="landing-nav-links">
          <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate("/ai")}>Open App</button>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-content">
          <span className="hero-badge">
            <span className="badge-dot" aria-hidden="true" />
            AI-Powered Developer Workspace
          </span>
          <h1>
            Optimize Workflow. <span className="accent">Accelerate Learning.</span>{" "}
            <span className="blue">Empower Developers.</span>
          </h1>
          <p className="hero-sub">
            One workspace for code snippets, AI assistance, and learning tracking —
            designed for developers who ship fast.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={() => navigate("/ai")}>Get Started →</button>
            <a className="btn btn-secondary" href="#features">Learn More</a>
          </div>
          <div className="hero-stats">
            <div className="hero-stat"><div className="hero-stat-value">{liveStats.snippets}</div><div className="hero-stat-label">Your Snippets</div></div>
            <div className="hero-stat"><div className="hero-stat-value">{liveStats.topics}</div><div className="hero-stat-label">Your Topics</div></div>
            <div className="hero-stat"><div className="hero-stat-value">{liveStats.progress}%</div><div className="hero-stat-label">Learning Progress</div></div>
          </div>
        </div>
      </section>

      <section className="section" id="features">
        <div className="section-header reveal">
          <h2>Everything You Need</h2>
          <p>Four integrated tools that replace your scattered workflow.</p>
        </div>
        <div className="features-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon" aria-hidden="true">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section section-alt">
        <div className="section-header">
          <h2>See It In Action</h2>
          <p>A fast, focused interface built for developer flow.</p>
        </div>
        <div className="preview-container">
          <div className="preview-bar">
            <span className="preview-dot" /><span className="preview-dot" /><span className="preview-dot" />
          </div>
          <div className="preview-body">
            <div className="preview-sidebar">
              <div className="preview-sidebar-item active">🤖 AI Helper</div>
              <div className="preview-sidebar-item">💾 Snippets</div>
              <div className="preview-sidebar-item">📚 Tracker</div>
              <div className="preview-sidebar-item">⚙️ Settings</div>
            </div>
            <div className="preview-main">
              <div className="preview-card-row">
                <div className="preview-mini-card"><div className="num">12</div><div className="label">Snippets</div></div>
                <div className="preview-mini-card"><div className="num">8</div><div className="label">Topics</div></div>
                <div className="preview-mini-card"><div className="num">67%</div><div className="label">Progress</div></div>
              </div>
              <div className="preview-chart" aria-hidden="true">
                {[35, 55, 40, 70, 50, 80, 45, 65, 75, 90].map((h, i) => (
                  <div key={i} className="preview-chart-bar" style={{ left: `${i * 10}%`, width: "8%", height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header reveal">
          <h2>Why NEXUS</h2>
          <p>Real capabilities, demonstrated — not invented numbers.</p>
        </div>
        <div className="metrics-grid">
          {[
            { value: "3-in-1", label: "AI assistant, snippet manager, and learning tracker in one workspace" },
            { value: "100%", label: "Of your data stays local — private by default, exportable anytime" },
            { value: "8+", label: "Built-in prompt templates for common development tasks" },
          ].map((m) => (
            <div key={m.label} className="metric-card">
              <div className="metric-value">{m.value}</div>
              <div className="metric-label">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="section section-alt">
        <div className="section-header reveal">
          <h2>Built Around Developer Workflows</h2>
          <p>The daily loops NEXUS is designed to serve.</p>
        </div>
        <div className="testimonials-grid">
          {[
            { title: "Debugging a stubborn error", desc: "Paste the stack trace into the AI Helper, get a diagnosis with a fix, and save the working pattern as a snippet for next time.", icon: "🐛" },
            { title: "Learning something new", desc: "Break a topic into sub-tasks in the Tracker, slide progress as you go, and watch the overall ring fill up.", icon: "📖" },
            { title: "Reusing what you already wrote", desc: "Search every snippet by name or code content, copy it in one click, and stop scrolling old projects.", icon: "♻️" },
          ].map((t) => (
            <div key={t.title} className="testimonial-card">
              <p className="testimonial-text">{t.desc}</p>
              <div className="testimonial-author">
                <div className="testimonial-avatar" aria-hidden="true">{t.icon}</div>
                <div><div className="testimonial-name">{t.title}</div><div className="testimonial-role">Core workflow</div></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">
        <div className="footer-links">
          <a href="#features">Features</a>
          <button onClick={() => navigate("/ai")} style={{ background: "none", border: "none", color: "var(--accent-secondary)", fontWeight: 500 }}>Open App</button>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
        <p className="footer-copy">© {new Date().getFullYear()} NEXUS. Built for developers who ship.</p>
      </footer>
    </div>
  );
}

/* ================================================================
   Icons
   ================================================================ */
const HamburgerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/* ================================================================
   Prompt Templates
   ================================================================ */
const PROMPT_TEMPLATES = [
  { label: "React Component", prompt: "Create a React functional component with TypeScript props, error boundaries, and loading state. Include JSDoc comments." },
  { label: "API Endpoint", prompt: "Build a REST API endpoint with input validation, error handling, and proper HTTP status codes. Use async/await." },
  { label: "Debug Code", prompt: "Analyze this code for bugs, race conditions, and performance issues. Suggest fixes with explanations." },
  { label: "Unit Test", prompt: "Write comprehensive unit tests using Vitest/Jest. Cover edge cases, error paths, and happy paths." },
  { label: "Refactor", prompt: "Refactor this code for better readability, DRY principles, and SOLID design patterns. Explain each change." },
  { label: "SQL Query", prompt: "Write an optimized SQL query with proper indexing hints, explain the execution plan, and suggest improvements." },
  { label: "Git Workflow", prompt: "Help me set up a Git workflow with feature branches, conventional commits, and automated changelogs." },
  { label: "Docker Config", prompt: "Create a multi-stage Dockerfile for a production Node.js app with health checks and security best practices." },
];

/* ================================================================
   App Shell
   ================================================================ */
const VALID_PAGES = ["home", "ai", "snippets", "tracker", "settings"];

function AppShell() {
  const navigate = useNavigate();
  const { page: urlPage } = useParams();
  const currentPage = VALID_PAGES.includes(urlPage) ? urlPage : "home";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // State
  const [theme, setTheme] = useState(() => readTheme() || "dark");
  const [aiPrompt, setAiPrompt] = useState("");
  const [trackerInput, setTrackerInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [snippets, setSnippets] = useState(() =>
    isStorageAvailable() ? loadList([storageKeys.snippets, "codeSnippets"], normalizeSnippet) : [],
  );
  const [snippetName, setSnippetName] = useState("");
  const [trackerTopics, setTrackerTopics] = useState(() =>
    isStorageAvailable() ? loadList([storageKeys.tracker, "learningTracker"], normalizeTopic) : [],
  );
  const [currentTopicStatus, setCurrentTopicStatus] = useState("pending");
  const [storageWarning, setStorageWarning] = useState(() => !isStorageAvailable());
  const [confirmState, setConfirmState] = useState(null);
  const [editingSnippetId, setEditingSnippetId] = useState(null);
  const [snippetSearch, setSnippetSearch] = useState("");
  const [snippetView, setSnippetView] = useState("grid");
  const [snippetTagInput, setSnippetTagInput] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [semanticMode, setSemanticMode] = useState(false);
  const [semanticResults, setSemanticResults] = useState(null);
  const [semanticStatus, setSemanticStatus] = useState("");
  const [trackerFilter, setTrackerFilter] = useState("all");
  const [aiHistory, setAiHistory] = useState(() => {
    if (!isStorageAvailable()) return [];
    const saved = readJSON(storageKeys.aiHistory);
    return Array.isArray(saved) ? saved.slice(0, 50) : [];
  });
  const [subTaskInputs, setSubTaskInputs] = useState({});
  const [chatMessages, setChatMessages] = useState(() => {
    if (!isStorageAvailable()) return [];
    const saved = readJSON(storageKeys.chatMessages);
    return Array.isArray(saved) ? saved.slice(-MAX_CHAT_MESSAGES) : [];
  });
  const abortRef = useRef(null);
  const chatEndRef = useRef(null);
  // Live snapshots for tool execution (search must see current state even
  // mid-agentic-round, before React commits).
  const snippetsRef = useRef(snippets);
  const pendingSnippetsRef = useRef([]);
  const { toasts, showToast, dismissToast } = useToasts();

  const setCurrentPage = useCallback((page) => { navigate(`/${page}`); }, [navigate]);

  // ---- Persistence ----
  useEffect(() => {
    if (!safeSave(storageKeys.snippets, snippets)) queueMicrotask(() => setStorageWarning(true));
  }, [snippets]);
  useEffect(() => {
    if (!safeSave(storageKeys.tracker, trackerTopics)) queueMicrotask(() => setStorageWarning(true));
  }, [trackerTopics]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    safeSave(storageKeys.theme, theme);
  }, [theme]);
  useEffect(() => {
    if (!safeSave(storageKeys.chatMessages, chatMessages.slice(-MAX_CHAT_MESSAGES))) {
      queueMicrotask(() => setStorageWarning(true));
    }
  }, [chatMessages]);
  useEffect(() => {
    if (!safeSave(storageKeys.aiHistory, aiHistory.slice(0, 50))) {
      queueMicrotask(() => setStorageWarning(true));
    }
  }, [aiHistory]);

  // ---- Cross-tab sync ----
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === storageKeys.snippets) setSnippets(parseList(e.newValue, normalizeSnippet));
      else if (e.key === storageKeys.tracker) setTrackerTopics(parseList(e.newValue, normalizeTopic));
      else if (e.key === storageKeys.theme) {
        try { const next = JSON.parse(e.newValue); if (next === "dark" || next === "light") setTheme(next); } catch { /* ignore malformed theme */ }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => { snippetsRef.current = snippets; }, [snippets]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, loading]);

  // Esc toggles the sidebar (the shortcut the Dashboard/Settings docs promise).
  // When a dialog is open, Esc belongs to the dialog — mirrored through a ref
  // because a DOM query would race React's async re-render on the same event.
  const modalOpenRef = useRef(false);
  useEffect(() => {
    modalOpenRef.current = confirmState != null || editingSnippetId != null;
  }, [confirmState, editingSnippetId]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || modalOpenRef.current) return;
      setSidebarOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Gemini ----
  // Agentic loop: the model can call local tools (save/search snippets,
  // add topics). Calls execute against app state, results go back to the
  // model, and it continues — up to MAX_TOOL_ROUNDS per user request.
  const CHAT_CONTEXT_TURNS = 8;
  const MAX_TOOL_ROUNDS = 4;
  const isNotice = (content) =>
    content.startsWith("⚠️") || content.startsWith("ℹ️") || content.startsWith("⏹️");

  const TOOL_DECLARATIONS = [{
    functionDeclarations: [
      {
        name: "save_snippet",
        description: "Save a code snippet to the user's local snippet library. Use when the user asks to store or keep code, or when you produced code they likely want to keep.",
        parameters: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "Short descriptive name" },
            code: { type: "STRING", description: "The code to save" },
            tags: { type: "STRING", description: "Comma-separated lowercase tags, e.g. 'react, hooks'" },
          },
          required: ["name", "code"],
        },
      },
      {
        name: "search_snippets",
        description: "Search the user's saved snippet library by keywords. Use when the user asks whether they already have code for something.",
        parameters: {
          type: "OBJECT",
          properties: { query: { type: "STRING", description: "Keywords to search for" } },
          required: ["query"],
        },
      },
      {
        name: "add_topic",
        description: "Add a learning topic to the user's learning tracker.",
        parameters: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "Topic name" },
            notes: { type: "STRING", description: "Optional short notes" },
          },
          required: ["name"],
        },
      },
    ],
  }];

  // Execute one tool call against local state. Returns the response object
  // sent back to the model.
  const runTool = (call) => {
    const args = call.args || {};
    try {
      if (call.name === "save_snippet") {
        const name = String(args.name || "Untitled snippet").slice(0, 80);
        const code = String(args.code || "");
        if (!code.trim()) return { ok: false, error: "code was empty" };
        const snippet = { id: uid(), name, code, tags: parseTags(args.tags) };
        pendingSnippetsRef.current = [snippet, ...pendingSnippetsRef.current];
        setSnippets((prev) => [snippet, ...prev]);
        return { ok: true, saved: name };
      }
      if (call.name === "search_snippets") {
        const q = String(args.query || "").toLowerCase();
        const seen = new Set();
        const pool = [...pendingSnippetsRef.current, ...snippetsRef.current].filter((s) =>
          seen.has(String(s.id)) ? false : (seen.add(String(s.id)), true),
        );
        const hits = pool
          .filter((s) =>
            s.name.toLowerCase().includes(q) ||
            (s.code || "").toLowerCase().includes(q) ||
            (s.tags || []).some((t) => t.includes(q)))
          .slice(0, 5)
          .map((s) => ({ name: s.name, tags: s.tags || [], preview: (s.code || "").slice(0, 300) }));
        return { ok: true, matches: hits, totalSearched: pool.length };
      }
      if (call.name === "add_topic") {
        const name = String(args.name || "").trim().slice(0, 60);
        if (!name) return { ok: false, error: "name was empty" };
        setTrackerTopics((prev) => [
          ...prev,
          { id: uid(), name, status: "incomplete", notes: String(args.notes || "").slice(0, 500), date: new Date().toLocaleDateString(), subTasks: [], progress: 0 },
        ]);
        return { ok: true, added: name };
      }
      return { ok: false, error: `Unknown tool: ${call.name}` };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  };

  const sendPrompt = async (promptText, opts = {}) => {
    const { regenerate = false, depth = 0, presetContents = null, silent = false } = opts;
    const prompt = (promptText || "").trim();
    if ((!prompt && !presetContents) || (loading && depth === 0)) return;

    if (depth === 0) {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      setLoading(true);
      if (!silent) addToHistory(prompt);
    }
    const controller = abortRef.current;

    let contents;
    let msgs = chatMessages;
    if (presetContents) {
      contents = presetContents;
    } else {
      if (regenerate) {
        msgs = [...msgs];
        while (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
      }
      const history = msgs
        .filter((m) => !isNotice(m.content) && !m.toolEvents)
        .slice(-CHAT_CONTEXT_TURNS)
        .map((m) => ({ role: m.role === "assistant" ? "model" : "user", text: m.content }));
      contents = [...history, { role: "user", text: prompt }];
    }

    if (depth === 0) {
      if (regenerate) setChatMessages(msgs);
      else setChatMessages((prev) => [...prev, { role: "user", content: prompt }]);
    }

    try {
      const apiRes = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, contents, tools: TOOL_DECLARATIONS }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;
      const data = await apiRes.json().catch(() => ({}));

      if (!apiRes.ok) {
        const errText = data.error || `Request failed (HTTP ${apiRes.status})`;
        setChatMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${errText}` }]);
        return;
      }

      const candidate = data.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const parts = candidate?.content?.parts || [];
      const toolCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);

      // ---- Agentic round: execute tools locally, feed results back ----
      if (toolCalls.length > 0 && depth < MAX_TOOL_ROUNDS) {
        const responseParts = [];
        const narrations = [];
        for (const call of toolCalls) {
          const result = runTool(call);
          responseParts.push({ functionResponse: { name: call.name, response: result } });
          narrations.push({ name: call.name, ok: result.ok !== false });
        }
        setChatMessages((prev) => [...prev, { role: "assistant", content: "", toolEvents: narrations }]);
        await sendPrompt("", {
          depth: depth + 1,
          silent: true,
          presetContents: [
            ...contents,
            { role: "model", parts },
            { role: "function", parts: responseParts },
          ],
        });
        return;
      }

      const aiText = parts.map((p) => p.text).filter(Boolean).join("");

      if (!aiText) {
        const msg =
          finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT"
            ? "The prompt was blocked by Gemini's safety filters. Try rephrasing."
            : finishReason === "RECITATION"
              ? "Response withheld due to recitation concerns. Try asking for a different approach."
              : "AI returned an empty response. Try rephrasing your prompt.";
        setChatMessages((prev) => [...prev, { role: "assistant", content: `ℹ️ ${msg}` }]);
        return;
      }

      setChatMessages((prev) => [...prev, { role: "assistant", content: aiText }]);
    } catch (err) {
      if (err.name === "AbortError") return;
      setChatMessages((prev) => [...prev, { role: "assistant", content: "⚠️ Failed to reach the AI service. Check your connection." }]);
    } finally {
      if (depth === 0) {
        if (!controller.signal.aborted) setLoading(false);
        if (abortRef.current === controller) abortRef.current = null;
      }
    }
  };

  const handleSend = async () => {
    if (!aiPrompt.trim() || loading) return;
    setAiPrompt("");
    await sendPrompt(aiPrompt);
  };

  const regenerateLast = async () => {
    if (loading) return;
    let lastUser = "";
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i].role === "user") { lastUser = chatMessages[i].content; break; }
    }
    if (!lastUser) return;
    await sendPrompt(lastUser, { regenerate: true });
  };

  const handleCancel = () => {
    if (abortRef.current) abortRef.current.abort();
    setLoading(false);
    setChatMessages((prev) => [...prev, { role: "assistant", content: "⏹️ Request cancelled." }]);
  };

  const addToHistory = (prompt) => {
    const now = new Date();
    setAiHistory((prev) => [
      { id: uid(), prompt: prompt.slice(0, 120), time: now.toLocaleTimeString(), at: now.getTime() },
      ...prev.slice(0, 49),
    ]);
  };

  // ---- Sub-task helpers ----
  const addSubTask = (topicId) => {
    const text = (subTaskInputs[topicId] || "").trim();
    if (!text) return;
    setTrackerTopics((prev) =>
      prev.map((t) => t.id === topicId ? { ...t, subTasks: [...(t.subTasks || []), { id: uid(), text, done: false }] } : t),
    );
    setSubTaskInputs((prev) => ({ ...prev, [topicId]: "" }));
  };
  const toggleSubTask = (topicId, subId) => {
    setTrackerTopics((prev) =>
      prev.map((t) => t.id === topicId ? { ...t, subTasks: (t.subTasks || []).map((st) => st.id === subId ? { ...st, done: !st.done } : st) } : t),
    );
  };
  const deleteSubTask = (topicId, subId) => {
    setTrackerTopics((prev) =>
      prev.map((t) => t.id === topicId ? { ...t, subTasks: (t.subTasks || []).filter((st) => st.id !== subId) } : t),
    );
  };
  const updateTopicProgress = (topicId, progress) => {
    setTrackerTopics((prev) =>
      prev.map((t) => t.id === topicId ? { ...t, progress: Math.max(0, Math.min(100, Number(progress))) } : t),
    );
  };

  // ---- Snippets ----
  // The snippet-save bar operates on the latest AI reply — derived from the
  // persisted chat, so it keeps working after a refresh ("response" state is
  // stale legacy and is NOT restored on reload).
  const lastAiMessage = (() => {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      const m = chatMessages[i];
      if (m.role === "assistant" && m.content && !m.content.startsWith("⚠️") && !m.content.startsWith("ℹ️") && !m.content.startsWith("⏹️")) return m.content;
    }
    return "";
  })();

  const saveSnippet = () => {
    const name = snippetName.trim();
    if (!name) { showToast("Give the snippet a name first", { kind: "undo" }); return; }
    if (!lastAiMessage) { showToast("Nothing to save yet — ask the AI something first", { kind: "undo" }); return; }
    setSnippets([{ id: uid(), name, code: lastAiMessage, tags: parseTags(snippetTagInput) }, ...snippets]);
    setSnippetName("");
    setSnippetTagInput("");
    showToast(`Saved "${name}"`);
  };

  // AI → Tracker bridge: turn the latest AI explanation into a learning topic.
  const saveAsTopic = () => {
    if (!lastAiMessage) return;
    const headingLine = lastAiMessage.split("\n").find((l) => /^#{1,3}\s+/.test(l));
    const name = (headingLine ? headingLine.replace(/^#{1,3}\s+/, "") : lastAiMessage.split("\n")[0] || "")
      .replace(/[*`#]/g, "")
      .trim()
      .slice(0, 60) || "AI topic";
    setTrackerTopics((prev) => [
      ...prev,
      { id: uid(), name, status: "incomplete", notes: lastAiMessage.slice(0, 500), date: new Date().toLocaleDateString(), subTasks: [], progress: 0 },
    ]);
    showToast(`Added "${name}" to Learning Tracker`);
  };

  const copyText = useCallback(
    async (text, label = "Copied to clipboard") => {
      try {
        await navigator.clipboard.writeText(text);
        showToast(label);
      } catch {
        const area = document.createElement("textarea");
        area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
        document.body.appendChild(area); area.select();
        let ok = false;
        try { ok = document.execCommand("copy"); } catch { ok = false; }
        document.body.removeChild(area);
        showToast(ok ? label : "Copy failed — clipboard access is blocked", { kind: ok ? "info" : "undo" });
      }
    },
    [showToast],
  );

  const deleteSnippetWithUndo = (id) => {
    const index = snippets.findIndex((s) => s.id === id);
    if (index === -1) return;
    const removed = snippets[index];
    if (editingSnippetId === id) setEditingSnippetId(null);
    setSnippets(snippets.filter((s) => s.id !== id));
    showToast(`Deleted "${removed.name}"`, {
      kind: "undo",
      action: { label: "Undo", onClick: () => setSnippets((prev) => { const next = [...prev]; next.splice(Math.min(index, next.length), 0, removed); return next; }) },
    });
  };

  const saveSnippetEdit = (id, name, code, tags) => {
    if (!name) { showToast("Name can't be empty", { kind: "undo" }); return; }
    setSnippets(snippets.map((s) => (s.id === id ? { ...s, name, code, tags: parseTags(tags) } : s)));
    setEditingSnippetId(null);
    showToast("Snippet updated");
  };

  const editingSnippet = snippets.find((s) => s.id === editingSnippetId) || null;

  // ---- Tracker ----
  const addTopic = () => {
    const name = trackerInput.trim();
    if (!name) return;
    setTrackerTopics([
      ...trackerTopics,
      { id: uid(), name, status: currentTopicStatus, notes: "", date: new Date().toLocaleDateString(), subTasks: [], progress: 0 },
    ]);
    setTrackerInput("");
  };

  const updateTopicStatus = (id, status) =>
    setTrackerTopics(trackerTopics.map((t) => (t.id === id ? { ...t, status } : t)));

  const deleteTopicWithUndo = (id) => {
    const index = trackerTopics.findIndex((t) => t.id === id);
    if (index === -1) return;
    const removed = trackerTopics[index];
    setTrackerTopics(trackerTopics.filter((t) => t.id !== id));
    showToast(`Deleted "${removed.name}"`, {
      kind: "undo",
      action: { label: "Undo", onClick: () => setTrackerTopics((prev) => { const next = [...prev]; next.splice(Math.min(index, next.length), 0, removed); return next; }) },
    });
  };

  const getStats = () => {
    const total = trackerTopics.length;
    const completed = trackerTopics.filter((t) => t.status === "completed").length;
    const pending = trackerTopics.filter((t) => t.status === "pending").length;
    const incomplete = trackerTopics.filter((t) => t.status === "incomplete").length;
    return { total, completed, pending, incomplete, overallProgress: total ? Math.round((completed / total) * 100) : 0 };
  };

  // ---- Settings ----
  const requestClearData = () =>
    setConfirmState({
      title: "Clear all data?",
      message: "This permanently deletes all snippets and learning topics from this browser. Your theme is kept. Export a backup first if you're unsure.",
      confirmLabel: "Delete everything",
      action: () => { setSnippets([]); setTrackerTopics([]); setAiHistory([]); setChatMessages([]); clearAppData(); showToast("All data cleared"); },
    });

  const exportData = () => {
    const data = { snippets, tracker: trackerTopics };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `nexus-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast("Export downloaded");
  };

  const importData = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const snippetsIn = Array.isArray(parsed) ? parsed : parsed.snippets;
        const topicsIn = Array.isArray(parsed) ? [] : parsed.tracker;
        if (!Array.isArray(snippetsIn) && !Array.isArray(topicsIn)) {
          showToast("That file doesn't look like a NEXUS export", { kind: "undo" }); return;
        }
        const importedSnippets = (snippetsIn || []).map(normalizeSnippet).filter(Boolean);
        const importedTopics = (topicsIn || []).map(normalizeTopic).filter(Boolean);
        const byId = new Map(snippets.map((s) => [String(s.id), s]));
        for (const s of importedSnippets) byId.set(String(s.id), s);
        setSnippets([...byId.values()]);
        const topicById = new Map(trackerTopics.map((t) => [String(t.id), t]));
        for (const t of importedTopics) topicById.set(String(t.id), t);
        setTrackerTopics([...topicById.values()]);
        showToast(`Imported ${importedSnippets.length} snippet(s) and ${importedTopics.length} topic(s)`);
      } catch {
        showToast("Could not read that file", { kind: "undo" });
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  // ---- Inline markdown: **bold**, *italic*, `code` ----
  const renderInline = (text) => {
    if (!text) return null;
    const parts = [];
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`(.+?)`)/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
      if (match[2]) parts.push(<strong key={match.index}>{match[2]}</strong>);
      else if (match[3]) parts.push(<em key={match.index}>{match[3]}</em>);
      else if (match[4]) parts.push(<s key={match.index}>{match[4]}</s>);
      else if (match[5]) parts.push(<code key={match.index} className="inline-code">{match[5]}</code>);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : parts;
  };

  // ---- AI response rendering ----
  const renderMsgContent = (content) => {
    const segments = parseSegments(content);
    if (segments.length === 0) return <p className="ai-text">{content}</p>;
    return segments.map((seg, i) => {
      switch (seg.type) {
        case "code":
          return (
            <div key={i} className="code-segment">
              <div className="code-segment-header">
                <span>{seg.lang || "code"}</span>
                <button onClick={() => copyText(seg.code, "Code copied")}>Copy code</button>
              </div>
              <pre className="code-block"><code>{seg.code}</code></pre>
            </div>
          );
        case "heading": {
          const Tag = `h${Math.min(seg.level, 4)}`;
          return <Tag key={i} className={`ai-heading ai-h${seg.level}`}>{renderInline(seg.content)}</Tag>;
        }
        case "bullet-list":
          return (
            <ul key={i} className="ai-list">
              {seg.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
            </ul>
          );
        case "numbered-list":
          return (
            <ol key={i} className="ai-list">
              {seg.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
            </ol>
          );
        case "hr":
          return <hr key={i} className="ai-hr" />;
        case "prose":
          return <p key={i} className="ai-text">{renderInline(seg.content)}</p>;
        default:
          return <p key={i} className="ai-text">{seg.content}</p>;
      }
    });
  };

  // ---- Filtered data ----
  const allTags = [...new Set(snippets.flatMap((s) => s.tags || []))].sort();

  // Keyword mode: name / tags / code match.
  const filteredSnippets = snippets.filter((s) => {
    const q = snippetSearch.toLowerCase();
    const matchesSearch =
      s.name.toLowerCase().includes(q) ||
      (s.code || "").toLowerCase().includes(q) ||
      (s.tags || []).some((t) => t.includes(q));
    const matchesTag = !activeTag || (s.tags || []).includes(activeTag);
    return matchesSearch && matchesTag;
  });

  // Semantic mode: embeddings decide relevance (debounced while typing).
  // Falls back to keyword results automatically if embeddings are unavailable.
  useEffect(() => {
    if (!semanticMode || !snippetSearch.trim()) { setSemanticResults(null); setSemanticStatus(""); return; }
    const timer = setTimeout(async () => {
      try {
        setSemanticStatus("embedding…");
        const results = await semanticSearch(snippets, snippetSearch);
        setSemanticResults(results);
      } catch {
        setSemanticResults(null);
      } finally {
        setSemanticStatus("");
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [semanticMode, snippetSearch, snippets]);

  const visibleSnippets =
    semanticMode && semanticResults
      ? semanticResults.filter((s) => !activeTag || (s.tags || []).includes(activeTag))
      : filteredSnippets;
  const filteredTopics = trackerTopics.filter((t) => trackerFilter === "all" ? true : t.status === trackerFilter);
  const stats = getStats();

  const navItems = [
    { page: "home", emoji: "🏠", label: "Dashboard" },
    { page: "ai", emoji: "🤖", label: "AI Helper" },
    { page: "snippets", emoji: "💾", label: "Snippets" },
    { page: "tracker", emoji: "📚", label: "Tracker" },
    { page: "settings", emoji: "⚙️", label: "Settings" },
  ];

  const currentPageTitle = navItems.find((n) => n.page === currentPage)?.label || "NEXUS";

  // ---- Activity streak & heatmap (real, local timestamps only) ----
  const activity = useMemo(() => {
    const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const counts = new Map();
    const bump = (ts) => {
      if (!Number.isFinite(ts)) return;
      const k = dayKey(new Date(ts));
      counts.set(k, (counts.get(k) || 0) + 1);
    };
    for (const h of aiHistory) bump(typeof h.at === "number" ? h.at : Date.parse(h.time));
    for (const t of trackerTopics) bump(Date.parse(t.date));

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cells = [];
    for (let i = 34; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const k = dayKey(d);
      const count = counts.get(k) || 0;
      const level = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : 3;
      cells.push({ key: k, count, level });
    }
    let streak = 0;
    const cursor = new Date(today);
    if (!counts.get(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1); // today not started yet → grace
    while (counts.get(dayKey(cursor)) && streak < 365) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { streak, cells, activeDays: cells.filter((c) => c.count > 0).length };
  }, [aiHistory, trackerTopics]);

  // ---- Page Components ----
  const pageComponents = {
    /* ---- Dashboard Home ---- */
    home: (
      <section className="page-content" aria-label="Dashboard">
        <div className="dashboard-hero">
          <div className="dashboard-hero-text">
            <h2>Welcome back to NEXUS 🚀</h2>
            <p>Your AI-powered developer workspace — ready to help you ship faster.</p>
          </div>
          <div className="dashboard-hero-summary">
            <span className="hero-sum-item"><strong>{snippets.length}</strong> snippets</span>
            <span className="hero-sum-sep">·</span>
            <span className="hero-sum-item"><strong>{stats.total}</strong> topics</span>
            <span className="hero-sum-sep">·</span>
            <span className="hero-sum-item"><strong>{stats.overallProgress}%</strong> progress</span>
          </div>
        </div>

        <div className="dashboard-grid">
          {/* Quick Actions */}
          <div className="dashboard-panel">
            <div className="dashboard-panel-header">
              <h3>⚡ Quick Actions</h3>
            </div>
            <div className="dashboard-panel-body">
              <div className="quick-action-grid">
                <button className="quick-action" onClick={() => setCurrentPage("ai")}>
                  <span className="qa-icon">🤖</span> Ask AI a question
                </button>
                <button className="quick-action" onClick={() => setCurrentPage("snippets")}>
                  <span className="qa-icon">💾</span> Browse snippets
                </button>
                <button className="quick-action" onClick={() => setCurrentPage("tracker")}>
                  <span className="qa-icon">📚</span> Continue learning
                </button>
                <button className="quick-action" onClick={() => setCurrentPage("settings")}>
                  <span className="qa-icon">⚙️</span> Manage settings
                </button>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="dashboard-panel">
            <div className="dashboard-panel-header">
              <h3>📋 Recent Activity</h3>
            </div>
            <div className="dashboard-panel-body">
              {aiHistory.length === 0 && snippets.length === 0 && trackerTopics.length === 0 ? (
                <div className="activity-list">
                  <div className="activity-item">
                    <span className="activity-dot orange" />
                    <span>No activity yet — start by asking AI or saving a snippet!</span>
                  </div>
                </div>
              ) : (
                <div className="activity-list">
                  {aiHistory.slice(0, 3).map((h) => (
                    <div key={h.id} className="activity-item">
                      <span className="activity-dot orange" />
                      <span>Asked AI: {h.prompt}</span>
                      <span className="activity-time">{h.time}</span>
                    </div>
                  ))}
                  {snippets.slice(0, 2).map((s) => (
                    <div key={s.id} className="activity-item">
                      <span className="activity-dot blue" />
                      <span>Saved snippet: {s.name}</span>
                    </div>
                  ))}
                  {trackerTopics.filter((t) => t.status === "completed").slice(0, 2).map((t) => (
                    <div key={t.id} className="activity-item">
                      <span className="activity-dot green" />
                      <span>Completed: {t.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Dev Tips */}
          <div className="dashboard-panel">
            <div className="dashboard-panel-header">
              <h3>💡 Developer Tips</h3>
            </div>
            <div className="dashboard-panel-body">
              <div className="tips-list">
                {[
                  { icon: "⌨️", text: "Press Ctrl+Enter to send AI prompts instantly" },
                  { icon: "🔍", text: "Use the search bar to find snippets by name or code content" },
                  { icon: "📊", text: "Drag the progress slider on tracker topics to update completion" },
                  { icon: "📋", text: "Save AI responses as snippets for quick reuse later" },
                  { icon: "💡", text: "Use prompt templates to get started faster with common patterns" },
                ].map((tip, i) => (
                  <div key={i} className="tip-item">
                    <span className="tip-icon" aria-hidden="true">{tip.icon}</span>
                    <span className="tip-text">{tip.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Keyboard Shortcuts Quick Ref */}
          <div className="dashboard-panel">
            <div className="dashboard-panel-header">
              <h3>⌨️ Shortcuts</h3>
            </div>
            <div className="dashboard-panel-body">
              <div className="shortcuts-list">
                {[
                  ["Send AI prompt", "Ctrl + Enter"],
                  ["Add topic", "Enter"],
                  ["Save snippet", "Enter"],
                  ["Toggle sidebar", "Esc"],
                ].map(([action, keys]) => (
                  <div key={action} className="shortcut-row">
                    <span>{action}</span>
                    <span className="shortcut-keys"><kbd className="kbd">{keys}</kbd></span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Activity Streak & Heatmap */}
          <div className="dashboard-panel">
            <div className="dashboard-panel-header">
              <h3>🔥 Activity Streak</h3>
            </div>
            <div className="dashboard-panel-body">
              <div className="streak-row">
                <span className="streak-num">{activity.streak}</span>
                <span className="streak-label">
                  {activity.streak > 0 ? `day streak 🔥` : "no streak yet — start today!"}
                  <small>{activity.activeDays} active day{activity.activeDays !== 1 ? "s" : ""} in the last 5 weeks (AI prompts & topics)</small>
                </span>
              </div>
              <div className="heatmap" role="img" aria-label={`Activity heatmap: ${activity.activeDays} active days out of 35`}>
                {activity.cells.map((c) => (
                  <span key={c.key} className={`heat-cell lv${c.level}`} title={`${c.key}${c.count ? `: ${c.count} activity` : ""}`} />
                ))}
              </div>
            </div>
          </div>

          {/* AI Chat History */}
          <div className="dashboard-panel" style={{ gridColumn: aiHistory.length > 0 ? "1 / -1" : undefined }}>
            <div className="dashboard-panel-header">
              <h3>🤖 AI History</h3>
              {aiHistory.length > 0 && (
                <button className="btn-ghost" style={{ fontSize: ".72rem", padding: ".2rem .5rem" }} onClick={() => setAiHistory([])}>Clear</button>
              )}
            </div>
            <div className="dashboard-panel-body">
              {aiHistory.length === 0 ? (
                <div className="activity-list">
                  <div className="activity-item"><span className="activity-dot orange" /><span>No AI conversations yet — try the AI Helper!</span></div>
                </div>
              ) : (
                <div className="ai-history-grid">
                  {aiHistory.slice(0, 6).map((h) => (
                    <button key={h.id} className="ai-history-card" onClick={() => setCurrentPage("ai")}>
                      <div className="ai-history-card-time">{h.time}</div>
                      <div className="ai-history-card-prompt">{h.prompt}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Getting Started Checklist */}
          <div className="dashboard-panel">
            <div className="dashboard-panel-header">
              <h3>🎯 Getting Started</h3>
            </div>
            <div className="dashboard-panel-body">
              <div className="checklist">
                {[
                  { label: "Ask the AI a question", done: aiHistory.length > 0, action: () => setCurrentPage("ai") },
                  { label: "Save your first snippet", done: snippets.length > 0, action: () => setCurrentPage("ai") },
                  { label: "Add a learning topic", done: trackerTopics.length > 0, action: () => setCurrentPage("tracker") },
                  { label: "Complete a topic", done: stats.completed > 0, action: () => setCurrentPage("tracker") },
                  { label: "Export your data", done: false, action: () => setCurrentPage("settings") },
                ].map((item, i) => (
                  <button key={i} className={`checklist-item ${item.done ? "done" : ""}`} onClick={item.action}>
                    <span className="checklist-check" aria-hidden="true">{item.done ? "✅" : "⬜"}</span>
                    <span className="checklist-label">{item.label}</span>
                    {!item.done && <span className="checklist-arrow">→</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    ),

    /* ---- AI Helper ---- */
    ai: (
      <div className="ai-layout" aria-label="AI Helper">
        <div className="page-header" style={{ marginBottom: ".75rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: ".5rem" }}>
          <div>
            <h2><span className="page-icon">🤖</span> AI Code Helper</h2>
            <p>Generate, debug, and explore code with Gemini-powered AI</p>
          </div>
          {chatMessages.length > 0 && (
            <span className="ai-context-badge" title="The AI sees your recent messages as context">🔗 Multi-turn memory</span>
          )}
          {chatMessages.length > 0 && (
            <button className="btn-ghost" onClick={() => { setChatMessages([]); }} style={{ fontSize: ".78rem", padding: ".35rem .7rem", flexShrink: 0 }}>
              🗑️ New Chat
            </button>
          )}
        </div>

        <div className="prompt-templates" role="group" aria-label="Quick prompt templates">
          {PROMPT_TEMPLATES.map((t) => (
            <button key={t.label} className="prompt-template-btn" onClick={() => setAiPrompt(t.prompt)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="ai-chat-area">
          <div className="ai-chat-messages">
            {chatMessages.length === 0 && !loading ? (
              <div className="ai-empty-chat">
                <div className="empty-icon">🤖</div>
                <h3>Ready to help</h3>
                <p>Pick a template above or write your own prompt. You can ask for components, debug code, write tests, and more.</p>
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} className={`ai-msg ${msg.role}`}>
                  {msg.role === "user" ? (
                    <span>{msg.content}</span>
                  ) : msg.toolEvents ? (
                    <div className="tool-narrations">
                      {msg.toolEvents.map((t, j) => (
                        <span key={j} className={`tool-chip ${t.ok ? "" : "err"}`}>
                          {t.ok ? "⚙️" : "⚠️"} {t.name}() {t.ok ? "executed" : "failed"}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="ai-msg-body">{renderMsgContent(msg.content)}</div>
                      <div className="ai-msg-actions">
                        <button onClick={() => copyText(msg.content, "Message copied")}>📋 Copy</button>
                        {i === chatMessages.length - 1 && (
                          <button onClick={regenerateLast} disabled={loading}>🔄 Regenerate</button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
            {loading && (
              <div className="ai-loading-msg">
                <div className="ai-spinner" /> Thinking...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {lastAiMessage && (
            <div className="ai-response-actions">
              <label className="sr-only" htmlFor="snippet-name">Save as snippet</label>
              <input
                id="snippet-name"
                value={snippetName}
                onChange={(e) => setSnippetName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveSnippet(); }}
                placeholder="Save as snippet..."
                style={{ flex: 1, minWidth: 120, padding: '.35rem .55rem', fontSize: '.8rem', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)' }}
              />
              <input
                className="save-tags-input"
                value={snippetTagInput}
                onChange={(e) => setSnippetTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveSnippet(); }}
                placeholder="🏷 react, css"
                aria-label="Tags for the new snippet"
                style={{ width: 130, padding: '.35rem .55rem', fontSize: '.8rem', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)' }}
              />
              <button onClick={() => copyText(lastAiMessage)}>📋 Copy all</button>
              <button onClick={() => copyText(extractFirstCodeBlock(lastAiMessage), "Code copied")}>📋 Copy code</button>
              <button onClick={saveSnippet} disabled={!snippetName.trim()} style={{ color: snippetName.trim() ? 'var(--accent)' : undefined }}>💾 Save</button>
              <button onClick={saveAsTopic} title="Turn this explanation into a learning topic">📚 Add as topic</button>
            </div>
          )}

          <div className="ai-input-bar">
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSend();
                // Auto-resize
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
              }}
              placeholder="Describe what you need... (Ctrl+Enter to send)"
              rows="1"
              disabled={loading}
            />
            {loading ? (
              <button className="ai-cancel-btn" onClick={handleCancel}>Cancel</button>
            ) : (
              <button className="ai-send-btn" onClick={handleSend} disabled={!aiPrompt.trim()}>
                Send ⚡
              </button>
            )}
          </div>
          <div className="ai-input-hint">
            <span>{aiPrompt.length > 0 ? `${aiPrompt.length} chars` : ""}</span>
            <span>Ctrl+Enter to send</span>
          </div>
        </div>
      </div>
    ),

    /* ---- Snippets ---- */
    snippets: (
      <section className="page-content" aria-label="Snippets">
        <div className="page-header">
          <h2><span className="page-icon">💾</span> Code Snippets</h2>
          <p>{snippets.length} snippet{snippets.length !== 1 ? "s" : ""} saved</p>
        </div>

        <div className="snippets-toolbar">
          <div className="snippets-search">
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input type="search" placeholder="Search by name or code..." value={snippetSearch}
              onChange={(e) => setSnippetSearch(e.target.value)} aria-label="Search snippets" />
          </div>
          <div className="view-toggle" role="group" aria-label="View mode">
            <button className={snippetView === "grid" ? "active" : ""} onClick={() => setSnippetView("grid")} aria-pressed={snippetView === "grid"}>▦ Grid</button>
            <button className={snippetView === "list" ? "active" : ""} onClick={() => setSnippetView("list")} aria-pressed={snippetView === "list"}>☰ List</button>
          </div>
          <button
            className={`semantic-toggle ${semanticMode ? "active" : ""}`}
            onClick={() => { setSemanticMode(!semanticMode); setSemanticResults(null); }}
            aria-pressed={semanticMode}
            title="Rank results by meaning using embeddings, not just keywords"
          >
            ✨ Semantic
          </button>
        </div>

        {semanticMode && semanticStatus && <div className="semantic-status">{semanticStatus}</div>}

        {allTags.length > 0 && (
          <div className="tag-filter-row" role="group" aria-label="Filter snippets by tag">
            <button className={`tag-chip ${activeTag === "" ? "active" : ""}`} onClick={() => setActiveTag("")} aria-pressed={activeTag === ""}>all</button>
            {allTags.map((t) => (
              <button key={t} className={`tag-chip ${activeTag === t ? "active" : ""}`} onClick={() => setActiveTag(activeTag === t ? "" : t)} aria-pressed={activeTag === t}>#{t}</button>
            ))}
          </div>
        )}

        {visibleSnippets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <h3>{snippetSearch ? "No matching snippets" : "No snippets yet"}</h3>
            <p>{snippetSearch ? "Try a different search term." : "Use the AI Helper to generate code, then save it here."}</p>
          </div>
        ) : (
          <div className={`snippets-grid view-${snippetView}`}>
            {visibleSnippets.map((s) => (
              <div key={s.id} className="snippet-card">
                <div className="snippet-card-header">
                  <h4>{s.name}</h4>
                </div>
                {(s.tags || []).length > 0 && (
                  <div className="snippet-tags">
                    {s.tags.map((t) => (
                      <button key={t} className="tag-chip" onClick={() => setActiveTag(t)} title={`Filter by #${t}`}>#{t}</button>
                    ))}
                  </div>
                )}
                <pre className="snippet-card-code">
                  <code>{(s.code || "").length > 200 ? `${s.code.slice(0, 200)}...` : (s.code || "")}</code>
                </pre>
                <div className="snippet-card-footer">
                  <button onClick={() => setEditingSnippetId(s.id)}>✏️ View</button>
                  <button onClick={() => copyText(s.code, "Code copied")}>📋 Copy</button>
                  <button className="danger" onClick={() => deleteSnippetWithUndo(s.id)}>🗑️ Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    ),

    /* ---- Tracker ---- */
    tracker: (
      <section className="page-content" aria-label="Learning Tracker">
        <div className="page-header">
          <h2><span className="page-icon">📚</span> Learning Tracker</h2>
          <p>Track your progress across topics and sub-tasks</p>
        </div>

        <div className="tracker-dashboard">
          <div className="tracker-stat stat-total">
            <div className="stat-icon">📊</div>
            <div className="stat-num">{stats.total}</div>
            <div className="stat-label">Total</div>
          </div>
          <div className="tracker-stat stat-pending">
            <div className="stat-icon">⏳</div>
            <div className="stat-num">{stats.pending}</div>
            <div className="stat-label">Pending</div>
          </div>
          <div className="tracker-stat stat-active">
            <div className="stat-icon">🔥</div>
            <div className="stat-num">{stats.incomplete}</div>
            <div className="stat-label">Active</div>
          </div>
          <div className="tracker-stat stat-done">
            <div className="stat-icon">✅</div>
            <div className="stat-num">{stats.completed}</div>
            <div className="stat-label">Done</div>
          </div>
        </div>

        <div className="tracker-progress-section">
          <div className="tracker-progress-ring">
            <svg viewBox="0 0 120 120" role="img" aria-label={`Overall progress: ${stats.overallProgress}%`}>
              <defs>
                <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--accent)" />
                  <stop offset="100%" stopColor="var(--success)" />
                </linearGradient>
              </defs>
              <circle className="progress-bg" cx="60" cy="60" r="52" />
              <circle className="progress-fill" cx="60" cy="60" r="52" strokeDasharray="327" strokeDashoffset={327 - (327 * stats.overallProgress) / 100} />
            </svg>
          </div>
          <div className="tracker-progress-info">
            <h3>Overall Progress</h3>
            <p>{stats.overallProgress}% complete — {stats.completed} of {stats.total} topics done</p>
          </div>
        </div>

        <div className="tracker-add-row">
          <select aria-label="Status for new topic" value={currentTopicStatus} onChange={(e) => setCurrentTopicStatus(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="incomplete">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          <input aria-label="New topic name" value={trackerInput} onChange={(e) => setTrackerInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTopic(); }} placeholder="Add new learning topic..." />
          <button className="tracker-add-btn" onClick={addTopic}>+ Add</button>
        </div>

        <div className="tracker-filter-row" role="group" aria-label="Filter topics">
          {[["all", "All"], ["pending", "Pending"], ["incomplete", "In Progress"], ["completed", "Completed"]].map(([key, label]) => (
            <button key={key} className={`tracker-filter-btn ${trackerFilter === key ? "active" : ""}`} onClick={() => setTrackerFilter(key)}>
              {label}
            </button>
          ))}
        </div>

        <div className="topics-list">
          {filteredTopics.map((t) => {
            const doneSubs = (t.subTasks || []).filter((st) => st.done).length;
            const totalSubs = (t.subTasks || []).length;
            return (
              <div key={t.id} className={`topic-card ${t.status}`}>
                <div className="topic-top">
                  <h3>{t.name}</h3>
                  <div className="topic-meta">
                    <span className="topic-date">{t.date}</span>
                    <span className={`status-tag ${t.status}`}>{t.status === "incomplete" ? "IN PROGRESS" : t.status.toUpperCase()}</span>
                  </div>
                </div>

                <div className="progress-slider-row">
                  <input type="range" min="0" max="100" value={t.progress}
                    onChange={(e) => updateTopicProgress(t.id, e.target.value)} aria-label={`Progress: ${t.progress}%`} />
                  <span>{t.progress}%</span>
                </div>

                {(t.subTasks || []).length > 0 && (
                  <div className="topic-subtasks">
                    {t.subTasks.map((st) => (
                      <div key={st.id} className={`subtask-row ${st.done ? "done" : ""}`}>
                        <input type="checkbox" checked={st.done} onChange={() => toggleSubTask(t.id, st.id)} id={`st-${st.id}`} />
                        <label htmlFor={`st-${st.id}`}>{st.text}</label>
                        <button className="subtask-delete" onClick={() => deleteSubTask(t.id, st.id)} aria-label={`Delete sub-task: ${st.text}`}>×</button>
                      </div>
                    ))}
                    <div style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>{doneSubs}/{totalSubs} done</div>
                  </div>
                )}

                <div className="add-subtask-row">
                  <input placeholder="Add sub-task..." value={subTaskInputs[t.id] || ""}
                    onChange={(e) => setSubTaskInputs((prev) => ({ ...prev, [t.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addSubTask(t.id); }} />
                  <button onClick={() => addSubTask(t.id)}>+</button>
                </div>

                <div className="topic-actions">
                  <button onClick={() => updateTopicStatus(t.id, "pending")} className={t.status === "pending" ? "active" : ""} aria-pressed={t.status === "pending"}>Pending</button>
                  <button onClick={() => updateTopicStatus(t.id, "incomplete")} className={t.status === "incomplete" ? "active" : ""} aria-pressed={t.status === "incomplete"}>In Progress</button>
                  <button onClick={() => updateTopicStatus(t.id, "completed")} className={t.status === "completed" ? "active" : ""} aria-pressed={t.status === "completed"}>Completed</button>
                  <button className="delete-btn" onClick={() => deleteTopicWithUndo(t.id)}>🗑️ Delete</button>
                </div>
              </div>
            );
          })}
          {filteredTopics.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">📚</div>
              <h3>{trackerFilter !== "all" ? "No topics with this status" : "No topics yet"}</h3>
              <p>{trackerFilter !== "all" ? "Try a different filter." : "Add your first learning topic above!"}</p>
            </div>
          )}
        </div>
      </section>
    ),

    /* ---- Settings ---- */
    settings: (
      <section className="page-content" aria-label="Settings">
        <div className="page-header">
          <h2><span className="page-icon">⚙️</span> Settings</h2>
          <p>Customize your workspace</p>
        </div>

        {storageWarning && (
          <div className="storage-warning" role="alert">⚠️ Browser storage is unavailable or full — data won't persist.</div>
        )}

        <div className="settings-grid">
          <div className="settings-card">
            <h3><span className="card-icon">🎨</span> Appearance</h3>
            <div className="setting-row">
              <div className="setting-label">Theme<small>Switch between dark and light mode</small></div>
              <select id="theme-select" value={theme} onChange={(e) => setTheme(e.target.value)}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          </div>

          <div className="settings-card">
            <h3><span className="card-icon">📦</span> Data Management</h3>
            <div className="setting-row">
              <div className="setting-label">Export<small>Download all snippets and topics as JSON</small></div>
              <button className="settings-btn primary" onClick={exportData}>Export</button>
            </div>
            <div className="setting-row">
              <div className="setting-label">Import<small>Restore from a NEXUS backup file</small></div>
              <label className="settings-btn">
                Import
                <input type="file" accept="application/json,.json" onChange={importData} style={{ display: "none" }} />
              </label>
            </div>
            <div className="setting-row">
              <div className="setting-label">Clear All Data<small>Permanently delete all snippets and topics</small></div>
              <button className="settings-btn danger" onClick={requestClearData}>Clear</button>
            </div>
          </div>

          <div className="settings-card">
            <h3><span className="card-icon">⌨️</span> Keyboard Shortcuts</h3>
            <div className="shortcuts-list">
              {[["Send prompt", [["Ctrl", "Enter"]]], ["Add topic", [["Enter"]]], ["Save snippet", [["Enter"]]], ["Toggle sidebar", [["Esc"]]]].map(([action, keys]) => (
                <div key={action} className="shortcut-row">
                  <span>{action}</span>
                  <span className="shortcut-keys">
                    {keys.map((combo, i) => (
                      <span key={i}>{combo.map((k) => <kbd key={k} className="kbd">{k}</kbd>).reduce((a, b) => [a, "+", b])}</span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="settings-card">
            <h3><span className="card-icon">ℹ️</span> About NEXUS</h3>
            <div className="setting-row">
              <div className="setting-label">Version</div>
              <span style={{ color: "var(--text-muted)", fontSize: ".82rem" }}>2.0.0</span>
            </div>
            <div className="setting-row">
              <div className="setting-label">Snippets stored</div>
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>{snippets.length}</span>
            </div>
            <div className="setting-row">
              <div className="setting-label">Topics tracked</div>
              <span style={{ color: "var(--accent-secondary)", fontWeight: 600 }}>{trackerTopics.length}</span>
            </div>
            <div className="setting-row">
              <div className="setting-label">Overall progress</div>
              <span style={{ color: "var(--success)", fontWeight: 600 }}>{stats.overallProgress}%</span>
            </div>
          </div>
        </div>
      </section>
    ),
  };

  // ---- Sidebar & Layout ----
  return (
    <div className="app">
      <div className={`sidebar-backdrop ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

      <header className="app-header">
        <div className="app-header-left">
          <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}>
            {sidebarOpen ? <CloseIcon /> : <HamburgerIcon />}
          </button>
          <h1>
            <span className="brand-icon" aria-hidden="true">🚀</span>
            NEXUS
          </h1>
          <span className="page-title">
            <span className="breadcrumb-sep">/</span> {currentPageTitle}
          </span>
        </div>
        <div className="app-header-right">
          <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme">
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button className="theme-toggle" onClick={() => navigate("/")} aria-label="Back to landing page"
            style={{ fontSize: ".75rem" }}>
            ← Home
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="sidebar-brand">
            <span className="brand-icon" aria-hidden="true">🚀</span>
            NEXUS
          </div>
          <div className="sidebar-section-label">Navigation</div>
          <nav aria-label="Main navigation">
            {navItems.map((item) => (
              <button
                key={item.page}
                className={currentPage === item.page ? "nav-active" : ""}
                onClick={() => { setCurrentPage(item.page); setSidebarOpen(false); }}
                aria-label={item.label}
                aria-current={currentPage === item.page ? "page" : undefined}
              >
                <span className="nav-icon" aria-hidden="true">{item.emoji}</span>
                {item.label}
                {item.page === "snippets" && snippets.length > 0 && (
                  <span className="nav-badge">{snippets.length}</span>
                )}
                {item.page === "tracker" && stats.total > 0 && (
                  <span className="nav-badge">{stats.overallProgress}%</span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-section-label">Quick Stats</div>
            <div style={{ padding: ".5rem .75rem", fontSize: ".78rem", color: "var(--text-muted)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: ".2rem" }}>
                <span>Snippets</span><span style={{ color: "var(--accent)", fontWeight: 600 }}>{snippets.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: ".2rem" }}>
                <span>Topics</span><span style={{ color: "var(--accent-secondary)", fontWeight: 600 }}>{stats.total}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Progress</span><span style={{ color: "var(--success)", fontWeight: 600 }}>{stats.overallProgress}%</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="main-content">{pageComponents[currentPage]}</main>
      </div>

      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
      <ConfirmDialog dialog={confirmState}
        onConfirm={() => { confirmState?.action?.(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)} />
      <SnippetModal snippet={editingSnippet}
        onClose={() => setEditingSnippetId(null)} onSave={saveSnippetEdit} />
    </div>
  );
}

/* ================================================================
   Router
   ================================================================ */
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/:page" element={<AppShell />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
