// Translate raw proxy/Gemini errors into plain language — a recruiter (or
// anyone) should never see a Google API wall-of-text in the chat. Exported as
// a pure function so it can be unit-tested without React.

export function humanizeApiError(rawError, status) {
  const raw = String(rawError || "");
  const msg = raw.toLowerCase();

  if (msg.includes("quota") || msg.includes("resource_exhausted") || msg.includes("rate") || status === 429) {
    const retry = /retry in ([\d.]+)s/i.exec(raw);
    const wait = retry ? Math.ceil(parseFloat(retry[1])) : 0;
    const retryHint = wait > 0 ? ` Try again in ~${wait}s.` : " Wait a minute and try again.";
    return `The free Gemini tier allows about 20 requests per minute, and it's tired.${retryHint} (Everything else in the app keeps working.)`;
  }
  if (msg.includes("api key") || msg.includes("api_key") || status === 401 || status === 403) {
    return "The server's Gemini API key is missing or invalid. If you're self-hosting, set GEMINI_API_KEY in your hosting dashboard — see the README.";
  }
  if (msg.includes("safety") || msg.includes("blocked")) {
    return "That request was blocked by the AI provider's safety filter. Try rephrasing it.";
  }
  if (status === 502 || msg.includes("failed to reach")) {
    return "Couldn't reach the AI service just now. Check your connection and try again.";
  }
  if (msg.includes("too long") || status === 413) {
    return "That conversation got too long for one request. Start a New Chat and continue there.";
  }
  if (status >= 500) {
    return "The AI service hit a temporary problem. Please try again in a moment.";
  }
  return raw || `Request failed (HTTP ${status || "?"}).`;
}
