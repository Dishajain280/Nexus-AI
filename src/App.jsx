import { useState, useEffect } from "react";
import "./index.css";
import "./App.css";

function App() {
  const [currentPage, setCurrentPage] = useState("ai");
  const [theme, setTheme] = useState("dark");
  const [aiPrompt, setAiPrompt] = useState("");
  const [trackerInput, setTrackerInput] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [snippets, setSnippets] = useState([]);
  const [snippetName, setSnippetName] = useState("");
  const [trackerTopics, setTrackerTopics] = useState([]);
  const [currentTopicStatus, setCurrentTopicStatus] = useState("pending");

  // Load data
  useEffect(() => {
    try {
      const snippetsSaved = localStorage.getItem("codeSnippets");
      const trackerSaved = localStorage.getItem("learningTracker");
      if (snippetsSaved) setSnippets(JSON.parse(snippetsSaved));
      if (trackerSaved) setTrackerTopics(JSON.parse(trackerSaved));
    } catch (e) {
      console.error("Error loading saved data:", e);
    }

    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      setTheme(savedTheme);
      document.body.dataset.theme = savedTheme;
    }
  }, []);

  // Save snippets
  useEffect(() => {
    localStorage.setItem("codeSnippets", JSON.stringify(snippets));
  }, [snippets]);

  // Save tracker
  useEffect(() => {
    localStorage.setItem("learningTracker", JSON.stringify(trackerTopics));
  }, [trackerTopics]);

  // Save theme
  useEffect(() => {
    localStorage.setItem("theme", theme);
    document.body.dataset.theme = theme;
  }, [theme]);

  const handleSend = async () => {
    if (!aiPrompt.trim()) return;
    setLoading(true);
    setResponse("");
    try {
      const API_KEY = import.meta.env.VITE_GEMINI_API_KEY?.trim();
      if (!API_KEY) {
        setResponse(
          "// Error: VITE_GEMINI_API_KEY is missing in your .env file.",
        );
        setLoading(false);
        return;
      }

      const apiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: aiPrompt }] }],
          }),
        },
      );

      const data = await apiRes.json();

      if (!apiRes.ok) {
        setResponse(
          `// API Error: ${data.error?.message || "Failed to connect (Status " + apiRes.status + ")"}`,
        );
        setLoading(false);
        return;
      }

      const aiText =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "// AI could not generate a response.";
      setResponse(aiText);
    } catch (err) {
      console.error("Gemini API Error:", err);
      setResponse(
        "// Failed to connect to Gemini API. Check your network or API key.",
      );
    } finally {
      setLoading(false);
    }
  };

  const saveSnippet = () => {
    if (!snippetName.trim() || !response) {
      alert("Please provide a name for the snippet.");
      return;
    }
    const newSnippet = { id: Date.now(), name: snippetName, code: response };
    setSnippets([newSnippet, ...snippets]);
    setSnippetName("");
  };

  const deleteSnippet = (id) =>
    setSnippets(snippets.filter((s) => s.id !== id));

  const copyText = (text) => navigator.clipboard.writeText(text);

  const addTopic = () => {
    if (trackerInput.trim()) {
      setTrackerTopics([
        ...trackerTopics,
        {
          id: Date.now(),
          name: trackerInput.trim(),
          status: currentTopicStatus,
          notes: "",
          date: new Date().toLocaleDateString(),
          subTasks: [],
          progress: 0,
        },
      ]);
      setTrackerInput("");
    }
  };

  const updateTopicStatus = (id, status) => {
    setTrackerTopics(
      trackerTopics.map((t) => (t.id === id ? { ...t, status } : t)),
    );
  };

  const deleteTopic = (id) =>
    setTrackerTopics(trackerTopics.filter((t) => t.id !== id));

  const getStats = () => {
    const total = trackerTopics.length;
    const completed = trackerTopics.filter(
      (t) => t.status === "completed",
    ).length;
    const pending = trackerTopics.filter((t) => t.status === "pending").length;
    const incomplete = trackerTopics.filter(
      (t) => t.status === "incomplete",
    ).length;
    return {
      total,
      completed,
      pending,
      incomplete,
      overallProgress: total ? Math.round((completed / total) * 100) : 0,
    };
  };

  const clearData = () => {
    if (confirm("Clear all data?")) {
      setSnippets([]);
      setTrackerTopics([]);
      localStorage.clear();
    }
  };

  const exportData = () => {
    const data = { snippets, tracker: trackerTopics };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexus-data.json";
    a.click();
  };

  const pageComponents = {
    ai: (
      <section className="page-content">
        <h2>AI Helper</h2>
        <div className="input-section">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe the component or function you need..."
            rows="4"
            disabled={loading}
          />
          <button className="primary w-full" onClick={handleSend} disabled={loading || !aiPrompt.trim()}>
            {loading ? "Generating..." : "Generate Code"}
          </button>
        </div>
        {response && (
          <div className="response-section">
            <pre className="code-block">
              <code>{response}</code>
            </pre>
            <div className="action-row">
              <input
                value={snippetName}
                onChange={(e) => setSnippetName(e.target.value)}
                placeholder="Snippet name"
              />
              <button className="secondary" onClick={() => copyText(response)}>
                Copy
              </button>
              <button
                onClick={saveSnippet}
                disabled={!snippetName.trim()}
                className="primary"
              >
                Save Snippet
              </button>
            </div>
          </div>
        )}
      </section>
    ),
    snippets: (
      <section className="page-content">
        <h2>Saved Snippets ({snippets.length})</h2>
        <div className="items-grid">
          {snippets.map((s) => (
            <div key={s.id} className="item-card">
              <h4>{s.name}</h4>
              <pre className="preview-code">
                <code>{s.code.slice(0, 150)}...</code>
              </pre>
              <div className="card-actions">
                <button className="secondary flex-1" onClick={() => copyText(s.code)}>Copy</button>
                <button className="danger flex-1" onClick={() => deleteSnippet(s.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    ),
    tracker: (
      <section className="page-content">
        <h2>Learning Tracker</h2>
        <div className="dashboard">
          {(() => {
            const stats = getStats();
            return (
              <>
                <div className="stats-row">
                  <div className="stat-box">
                    <div className="stat-value">{stats.pending}</div>
                    <div className="text-sm font-semibold opacity-70">Pending</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-value">{stats.incomplete}</div>
                    <div className="text-sm font-semibold opacity-70">Incomplete</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-value">{stats.completed}</div>
                    <div className="text-sm font-semibold opacity-70">Completed</div>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-orange-500">{stats.overallProgress}%</div>
                  <div className="text-sm font-semibold opacity-70 uppercase tracking-wider">Overall Progress</div>
                </div>
              </>
            );
          })()}
        </div>
        <div className="add-row">
          <select
            className="flex-shrink-0"
            value={currentTopicStatus}
            onChange={(e) => setCurrentTopicStatus(e.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="incomplete">Incomplete</option>
            <option value="completed">Completed</option>
          </select>
          <input
            className="flex-1"
            value={trackerInput}
            onChange={(e) => setTrackerInput(e.target.value)}
            placeholder="What are you learning today?"
          />
          <button className="primary" onClick={addTopic}>Add Topic</button>
        </div>
        <div className="topics-list">
          {trackerTopics.map((t) => (
            <div key={t.id} className="topic-card">
              <div className="topic-top">
                <h3 className="text-lg font-bold">{t.name}</h3>
                <span className={`status-tag ${t.status}`}>
                  {t.status.toUpperCase()}
                </span>
              </div>
              <div className="topic-progress">
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${t.progress}%` }}
                  ></div>
                </div>
              </div>
              <div className="topic-actions">
                <button
                  onClick={() => updateTopicStatus(t.id, "pending")}
                  className={`secondary text-xs ${t.status === "pending" ? "active" : ""}`}
                >
                  Pending
                </button>
                <button
                  onClick={() => updateTopicStatus(t.id, "incomplete")}
                  className={`secondary text-xs ${t.status === "incomplete" ? "active" : ""}`}
                >
                  Incomplete
                </button>
                <button
                  onClick={() => updateTopicStatus(t.id, "completed")}
                  className={`secondary text-xs ${t.status === "completed" ? "active" : ""}`}
                >
                  Complete
                </button>
                <button
                  className="danger text-xs ml-auto"
                  onClick={() => deleteTopic(t.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {trackerTopics.length === 0 && (
            <p className="empty-state">Add your first learning topic!</p>
          )}
        </div>
      </section>
    ),
    settings: (
      <section className="page-content">
        <h2>Settings</h2>
        <div className="settings-list">
          <div className="setting-item">
            <label>Appearance</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="dark">Dark Mode</option>
              <option value="light">Light Mode</option>
            </select>
          </div>
          <div className="flex gap-4">
            <button className="secondary" onClick={exportData}>Export Data (JSON)</button>
            <button className="danger" onClick={clearData}>Clear All Data</button>
          </div>
        </div>
      </section>
    ),
  };

  return (
    <div className="app">
      <header className="header">
        <h1>NEXUS</h1>
        <p>Your Professional AI Development Workspace</p>
      </header>
      <div className="app-container">
        <aside className="sidebar">
          <nav>
            <button
              className={currentPage === "ai" ? "nav-active" : ""}
              onClick={() => setCurrentPage("ai")}
            >
              AI Helper
            </button>
            <button
              className={currentPage === "snippets" ? "nav-active" : ""}
              onClick={() => setCurrentPage("snippets")}
            >
              Code Snippets
            </button>
            <button
              className={currentPage === "tracker" ? "nav-active" : ""}
              onClick={() => setCurrentPage("tracker")}
            >
              Learning Path
            </button>
            <button
              className={currentPage === "settings" ? "nav-active" : ""}
              onClick={() => setCurrentPage("settings")}
            >
              Settings
            </button>
          </nav>
        </aside>
        <main className="main-content">{pageComponents[currentPage]}</main>
      </div>
    </div>
  );
}

export default App;
