// Dual-GPS fallback contract for the Kobo webhook parser.
//
// Payload A — native geopoint only.
// Payload B — manually typed lat/long only.
// Payload C — both present (native geopoint MUST win).
// All three must yield valid coordinates and geotagged=true.

import { describe, it, expect } from "vitest";
import {
  resolveCoordinates,
  parseGeopoint,
} from "../../../../supabase/functions/_shared/microplanRepeatItem";

const A = { community_gps: "11.7500 9.3400 480 5" };
const B = { manual_latitude: "12.0100", manual_longitude: "8.5200" };
const C = { community_gps: "11.7500 9.3400 480 5", manual_latitude: 12.01, manual_longitude: 8.52 };

describe("dual GPS resolution", () => {
  it("Payload A — native geopoint is parsed", () => {
    const r = resolveCoordinates(A);
    expect(r.lat).toBeCloseTo(11.75, 4);
    expect(r.lng).toBeCloseTo(9.34, 4);
    expect(r.source).toBe("geopoint");
    expect(r.geotagged).toBe(true);
  });

  it("Payload B — falls back to manually typed lat/long", () => {
    const r = resolveCoordinates(B);
    expect(r.lat).toBeCloseTo(12.01, 4);
    expect(r.lng).toBeCloseTo(8.52, 4);
    expect(r.source).toBe("manual");
    expect(r.geotagged).toBe(true);
  });

  it("Payload C — native geopoint takes precedence over manual entry", () => {
    const r = resolveCoordinates(C);
    expect(r.lat).toBeCloseTo(11.75, 4);
    expect(r.lng).toBeCloseTo(9.34, 4);
    expect(r.source).toBe("geopoint");
    expect(r.geotagged).toBe(true);
  });

  it("uses the Kobo _geolocation array when present", () => {
    const r = resolveCoordinates({ _geolocation: [11.1, 8.2], manual_latitude: 1, manual_longitude: 1 });
    expect(r.lat).toBe(11.1);
    expect(r.source).toBe("geopoint");
  });

  it("blank / invalid geopoint falls through to manual values", () => {
    const r = resolveCoordinates({ community_gps: "", manual_latitude: "10.5", manual_longitude: "7.4" });
    expect(r.source).toBe("manual");
    expect(r.lat).toBeCloseTo(10.5, 4);
  });

  it("rejects null-island and out-of-range coordinates (geotagged=false)", () => {
    expect(resolveCoordinates({ community_gps: "0 0 0 0" }).geotagged).toBe(false);
    expect(resolveCoordinates({ manual_latitude: 999, manual_longitude: 5 }).geotagged).toBe(false);
    expect(resolveCoordinates({}).geotagged).toBe(false);
    expect(resolveCoordinates({}).lat).toBeNull();
  });

  it("resolves group-scoped Kobo paths", () => {
    const r = resolveCoordinates({ "grp_comm_location/community_gps": "9.05 7.49 300 4" });
    expect(r.lat).toBeCloseTo(9.05, 4);
    expect(r.geotagged).toBe(true);
  });

  it("parseGeopoint handles array, string and garbage inputs", () => {
    expect(parseGeopoint([5, 6])).toEqual({ lat: 5, lng: 6 });
    expect(parseGeopoint("5,6")).toEqual({ lat: 5, lng: 6 });
    expect(parseGeopoint("not a point")).toEqual({ lat: null, lng: null });
  });
});
