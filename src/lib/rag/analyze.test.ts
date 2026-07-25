import { describe, expect, it } from "vitest";
import { extractEvidence } from "./analyze";

// Recruiter mode "shows the work" by surfacing the screen's PART 1 reasoning
// (the per-must-have evidence) that used to be discarded. extractEvidence is
// what separates that reasoning from the final JSON verdict.
describe("extractEvidence", () => {
  it("returns the PART 1 reasoning, without the labels or the JSON", () => {
    const completion = [
      "PART 1 (analysis):",
      "- TypeScript: met — 'built production Next.js apps'.",
      "- Kubernetes: partial — 'some Kubernetes'.",
      'PART 2 (final line):',
      '{"matchScore": 72, "mustHaves": "5/7", "missing": ["Kubernetes"], "risk": "medium", "riskNote": "x", "seniority": "fit", "apply": "yes"}',
    ].join("\n");

    const evidence = extractEvidence(completion);
    expect(evidence).toContain("TypeScript: met");
    expect(evidence).toContain("Kubernetes: partial");
    expect(evidence).not.toContain("PART 1");
    expect(evidence).not.toContain("PART 2");
    expect(evidence).not.toContain("matchScore");
  });

  it("captures evidence even without explicit PART labels", () => {
    const completion =
      "Requirement: Python — met.\n{\"matchScore\": 40, \"risk\": \"high\", \"seniority\": \"under\"}";
    expect(extractEvidence(completion)).toBe("Requirement: Python — met.");
  });

  it("returns empty when the completion is only the JSON verdict", () => {
    expect(
      extractEvidence('{"matchScore": 10, "risk": "high", "seniority": "under"}'),
    ).toBe("");
  });
});
