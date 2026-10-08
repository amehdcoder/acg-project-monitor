import { describe, expect, it } from "vitest";
import { cameraErrorMessage, preferredCamera } from "./scannerCamera";

describe("hand-card camera readiness", () => {
  it("explains denied permission instead of reporting a ready camera", () => {
    expect(cameraErrorMessage(new DOMException("Denied", "NotAllowedError"))).toContain("Camera permission was denied");
  });
  it("reports a missing camera", () => {
    expect(cameraErrorMessage(new DOMException("Missing", "NotFoundError"))).toContain("No camera was found");
  });
  it("reports a busy camera", () => {
    expect(cameraErrorMessage(new DOMException("Busy", "NotReadableError"))).toContain("Close other apps");
  });
  it("prefers the device's rear camera for scanning", () => {
    expect(preferredCamera([{ id: "front", label: "Front" }, { id: "rear", label: "Back camera" }])).toBe("rear");
  });
});