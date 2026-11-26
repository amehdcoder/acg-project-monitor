import { describe, expect, it } from "vitest";
import { stretchContrast } from "./lowLightDecode";

describe("stretchContrast", () => {
  it("turns a dark, low-contrast picture into full black and white", () => {
    const px = new Uint8ClampedArray(400 * 4);
    for (let i = 0; i < 400; i++) { const v = i % 2 ? 60 : 20; px.set([v, v, v, 255], i * 4); }
    stretchContrast(px);
    expect(px[0]).toBe(0);
    expect(px[4]).toBe(255);
  });
});
