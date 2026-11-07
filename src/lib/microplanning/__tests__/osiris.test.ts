import { describe, expect, it } from "vitest";
import { cddCategory, emptyLegendFilters, filterLegendPoints, eventsInState, nearbyEvents, recordedNumber, statePoints, type Boundary, type IntelEvent, type IntelPoint } from "../osiris";
const boundaries: Boundary[] = [{ type: "Feature", properties: { state: "Kano" }, geometry: { type: "Polygon", coordinates: [[[8,11],[9,11],[9,13],[8,13],[8,11]]] } }];
describe("OSIRIS planning evidence", () => {
  const points: IntelPoint[] = [
    {key:'a',lat:12,lng:8.5,entry:{security_clearance:'not_cleared',accessibility:'hard_to_reach',terrain_type:'riverine',cdd_names:'—'}},
    {key:'b',lat:12.1,lng:8.5,entry:{security_clearance:'partial',accessibility:'inaccessible',terrain_type:'mountainous',cdd_names:'Amina'}},
    {key:'c',lat:12.2,lng:8.5,entry:{security_clearance:'cleared',accessibility:'accessible',terrain_type:'flat'}},
  ];
  it('supports one selected security legend',()=>{expect(filterLegendPoints(points,{...emptyLegendFilters(),security:['not_cleared']}).map(p=>p.key)).toEqual(['a']);});
  it('includes multiple categories within a legend',()=>{expect(filterLegendPoints(points,{...emptyLegendFilters(),security:['not_cleared','partial']}).map(p=>p.key)).toEqual(['a','b']);});
  it('intersects security, hard-to-reach, terrain and no recorded CDD filters',()=>{expect(filterLegendPoints(points,{security:['not_cleared','partial'],accessibility:['hard_to_reach'],terrain:['riverine'],cdd:['unrecorded']}).map(p=>p.key)).toEqual(['a']);});
  it('keeps empty selections unrestricted and returns no points for incompatible selections',()=>{expect(filterLegendPoints(points,emptyLegendFilters())).toHaveLength(3);expect(filterLegendPoints(points,{...emptyLegendFilters(),security:['cleared'],terrain:['riverine']})).toEqual([]);});
  it('does not mistake placeholder CDD rosters for named distributors',()=>{for(const name of [null,'','—','None','N/A','No CDDs'])expect(cddCategory({cdd_names:name})).toBe('unrecorded');expect(cddCategory({cdd_names:'Amina; Yusuf'})).toBe('recorded');});
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