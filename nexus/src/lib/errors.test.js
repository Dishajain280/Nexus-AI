import { describe, it, expect } from "vitest";
import { humanizeApiError } from "./errors.js";

describe("humanizeApiError", () => {
  it("translates the Gemini free-tier quota wall-of-text", () => {
    const raw =
      "You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20. Please retry in 29.103429952s.";
    const out = humanizeApiError(raw, 429);
    expect(out).toContain("free Gemini tier");
    expect(out).toContain("20 requests per minute");
    expect(out).toContain("Try again in ~30s"); // ceil(29.1) — no raw docs links, no billing wording
    expect(out).not.toContain("https://");
    expect(out).not.toContain("billing");
  });

  it("handles rate-limit errors without a retry hint", () => {
    const out = humanizeApiError("Resource has been exhausted (rate limit)", 429);
    expect(out).toContain("Wait a minute");
  });

  it("explains missing API keys for self-hosters", () => {
    const out = humanizeApiError("GEMINI_API_KEY is not configured on the server.", 500);
    expect(out).toContain("GEMINI_API_KEY");
    expect(out).toContain("README");
  });

  it("maps safety blocks to rephrase advice", () => {
    expect(humanizeApiError("The response was blocked by safety filters.", 200)).toContain("safety filter");
  });

  it("maps transport and size failures", () => {
    expect(humanizeApiError("Failed to reach the Gemini API.", 502)).toContain("Check your connection");
    expect(humanizeApiError("Conversation is too long (max 24 turns).", 413)).toContain("New Chat");
  });

  it("passes through unknown messages but wraps bare statuses", () => {
    expect(humanizeApiError("Some exotic failure", 418)).toBe("Some exotic failure");
    expect(humanizeApiError("", 500)).toContain("temporary problem");
    expect(humanizeApiError(null)).toContain("Request failed");
  });
});
