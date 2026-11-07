import { describe, expect, it } from "vitest";
import { eventsInState, nearbyEvents, recordedNumber, statePoints, type Boundary, type IntelEvent } from "../osiris";
const boundaries: Boundary[] = [{ type: "Feature", properties: { state: "Kano" }, geometry: { type: "Polygon", coordinates: [[[8,11],[9,11],[9,13],[8,13],[8,11]]] } }];
describe("OSIRIS planning evidence", () => {
  it("uses corrected GPS and rejects out-of-state or absent locations", () => {
    const r=statePoints([{state:"Kano",community_latitude:12,community_longitude:8.5,community_lat_override:12.2,community_lng_override:8.6},{state:"Kano",community_latitude:9,community_longitude:7},{state:"Kano"}],"Kano State",boundaries);
    expect(r.points[0].lat).toBe(12.2);expect(r.points[0].lng).toBe(8.6);expect(r.outside).toBe(1);expect(r.missing).toBe(1);
  });
  it("does not certify GPS without State geometry", () => {expect(statePoints([{state:"Kano",community_latitude:12,community_longitude:8.5}],"Kano",[]).points).toHaveLength(0);});
  it("filters public events by actual State geometry, not country anchors", () => {
    const events=[{id:"inside",lat:12,lng:8.5},{id:"outside",lat:9,lng:7}] as IntelEvent[];
    expect(eventsInState(events,"Kano",boundaries).map(e=>e.id)).toEqual(["inside"]);
  });
  it("links only real observations within the 10km proximity radius", () => {
    const p={key:"p",lat:12,lng:8.5,entry:{}};
    const events=[{id:"near",lat:12.01,lng:8.5},{id:"far",lat:13,lng:8.5}] as IntelEvent[];
    expect(nearbyEvents(p,events).map(e=>e.id)).toEqual(["near"]);
    expect(nearbyEvents(p,events)[0].distance).toBeCloseTo(1.112,2);
  });
  it("keeps missing population distinct from real zero",()=>{expect(recordedNumber(null)).toBeNull();expect(recordedNumber(0)).toBe(0);expect(recordedNumber(-1)).toBeNull();});
});