// ?stress=1: populate 5,000 snippets for scale testing the Snippets page
// (render cost, virtualization, search over a realistic library). Dev/docs
// tool only — like the demo seeder, clear it from Settings → Clear All Data.

const TOPICS = ["hooks", "css", "sql", "api", "testing", "perf", "utils"];

export function maybeSeedStressData() {
  try {
    if (!/[?&]stress=1/.test(window.location.search)) return false;
    if (localStorage.getItem("nexus:stressSeeded") === "1") return true;
    const now = Date.now();
    const snippets = [];
    for (let i = 0; i < 5000; i++) {
      const ts = new Date(now - (i % 240) * 86400000 - i * 60000).toISOString();
      snippets.push({
        id: `stress-${i}-${(now - i).toString(36)}`,
        name: `Snippet ${i}: ${TOPICS[i % TOPICS.length]} example`,
        code: `// stress snippet ${i}\nconst helper${i} = (input) => {\n  return input * ${i % 97};\n};\n// notes: lorem ipsum dolor sit amet, consectetur adipiscing elit ${i}`,
        tags: [TOPICS[i % TOPICS.length]],
        language: "javascript",
        createdAt: ts,
        updatedAt: ts,
        copies: i % 17,
      });
    }
    localStorage.setItem("nexus:codeSnippets", JSON.stringify(snippets));
    localStorage.setItem("nexus:stressSeeded", "1");
    return true;
  } catch {
    return false;
  }
}
