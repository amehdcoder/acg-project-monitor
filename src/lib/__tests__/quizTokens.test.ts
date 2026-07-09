import { describe, it, expect } from "vitest";
import {
  KNOWN_QUIZ_TOKENS,
  extractTokens,
  findUnknownTokens,
  findMissingTokens,
  validateMessageTokens,
  interpolateTokens,
} from "@/lib/quizTokens";

describe("quiz message token coverage", () => {
  it("extracts unique, case-insensitive tokens", () => {
    expect(extractTokens("Hi {Name}, you scored {name} {percentage}%").sort()).toEqual(
      ["name", "percentage"],
    );
  });

  it("flags unknown tokens so the admin preview can block sending", () => {
    const t = "Hi {name}, contact {manager} at {emailz}";
    expect(findUnknownTokens(t).sort()).toEqual(["emailz", "manager"]);
    const v = validateMessageTokens(t);
    expect(v.ok).toBe(false);
    expect(v.unknown.sort()).toEqual(["emailz", "manager"]);
  });

  it("passes validation when only known tokens are used", () => {
    const v = validateMessageTokens("Well done {name}! You scored {percentage}% on the {test}.");
    expect(v.ok).toBe(true);
    expect(v.unknown).toEqual([]);
    expect(v.hasNameToken).toBe(true);
  });

  it("reports supported tokens the message does not yet use", () => {
    const missing = findMissingTokens("Hi {name}");
    expect(missing).toContain("percentage");
    expect(missing).not.toContain("name");
  });

  it("interpolates all known tokens and leaves unknown ones intact", () => {
    const out = interpolateTokens("Hi {name}, {percentage}% ({score}/{total}) — {unknown}", {
      name: "Amina",
      score: 8,
      percentage: 80,
      total: 10,
      passing: 70,
      test: "Post-test",
    });
    expect(out).toBe("Hi Amina, 80% (8/10) — {unknown}");
  });

  it("exposes exactly the supported token set", () => {
    expect([...KNOWN_QUIZ_TOKENS].sort()).toEqual(
      ["name", "passing", "percentage", "score", "test", "total"],
    );
  });
});
