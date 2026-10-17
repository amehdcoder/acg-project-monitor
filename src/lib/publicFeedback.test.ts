import { describe, expect, it } from "vitest";
import { feedbackProjectId, isPublicFeedbackLocation, publicFeedbackUrl } from "./publicFeedback";

const id = "194f3ad9-8881-4c17-87b1-856103a584a0";
const location = (pathname: string, search = "", hash = "") => ({ pathname, search, hash });

describe("public CCFF links", () => {
  it("keeps every feedback path, including invalid links, in the form-only shell", () => {
    for (const path of [`/feedback/${id}`, "/feedback", "/feedback/bad/extra", "/ccff"]) {
      expect(isPublicFeedbackLocation(location(path))).toBe(true);
    }
    expect(isPublicFeedbackLocation(location("/cases"))).toBe(false);
    expect(isPublicFeedbackLocation(location("/", "?tab=cases"))).toBe(false);
  });
  it("resolves project QR, trailing slash, legacy query and hash links without authentication", () => {
    expect(feedbackProjectId(location(`/feedback/${id}/`))).toBe(id);
    expect(feedbackProjectId(location("/ccff", `?project_id=${id}`))).toBe(id);
    expect(feedbackProjectId(location("/feedback", `?projectId=${id}`))).toBe(id);
    expect(feedbackProjectId(location("/", "", `#/feedback/${id}`))).toBe(id);
    expect(isPublicFeedbackLocation(location("/", "", `#/feedback/${id}`))).toBe(true);
  });
  it("does not infer a project or accept a record/dashboard destination", () => {
    expect(feedbackProjectId(location("/feedback"))).toBeUndefined();
    expect(feedbackProjectId(location(`/feedback/${id}/cases`))).toBeUndefined();
    expect(feedbackProjectId(location("/feedback", "?project_id=/cases"))).toBeUndefined();
  });
  it("never encodes a temporary preview or localhost origin in community QR codes", () => {
    expect(publicFeedbackUrl(id, "http://localhost:8080")).toBe(`https://handscollect.lovable.app/feedback/${id}`);
    expect(publicFeedbackUrl(id, "https://id-preview--example.lovable.app")).toBe(`https://handscollect.lovable.app/feedback/${id}`);
    expect(publicFeedbackUrl(id, "https://www.amehnities.org")).toBe(`https://www.amehnities.org/feedback/${id}`);
  });
});