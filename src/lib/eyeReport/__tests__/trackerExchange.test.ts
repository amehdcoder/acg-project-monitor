import { describe, expect, it } from "vitest";
import { gpsEvent, trackerEpisodes, validateTrackerConfig, validateGpsConfig } from "../../../../supabase/functions/_shared/eyeTracker";
const config = { program:"Program0001", surgeryDate:"Surgery0001", eye:"EyeSide0001", baseline:"Baseline001", day30:"Thirty00001", day90:"Ninety00001", day180:"OneEighty01" };
const event = (values: Record<string,string>, extra={}) => ({ event:"Event000001", enrollment:"Enroll00001", program:config.program, orgUnit:"Facility001", dataValues:Object.entries(values).map(([dataElement,value])=>({dataElement,value})),...extra });
describe("Measured DHIS2 tracker and GPS exchange",()=>{
 it("joins real per-eye observations and leaves unmeasured milestones empty",async()=>{
  const result=await trackerEpisodes([event({Surgery0001:"2026-01-01",EyeSide0001:"R",Baseline001:"1.2"}),event({Surgery0001:"2026-01-01",EyeSide0001:"R",Thirty00001:"0.3"},{event:"Event000002"})],config,"connection",new Map([["Facility001",{name:"Clinic",lga:"Dutse"}]]));
  expect(result.rows[0]).toMatchObject({baseline:1.2,day30:0.3,day90:null,day180:null});
  expect(result.rows).toHaveLength(1); expect(result.rows[0].episode_key).not.toContain("Enroll00001");
  expect(result.rows[0].tracker_evidence.program).toBe(config.program);
 });
 it("never turns missing baseline, invalid logMAR or unknown eye into curves",async()=>{
  const result=await trackerEpisodes([event({Surgery0001:"2026-01-01",EyeSide0001:"R",Thirty00001:"0.3"}),event({Surgery0001:"2026-01-01",EyeSide0001:"L",Baseline001:"6/60"}),event({Surgery0001:"2026-01-01",EyeSide0001:"BOTH",Baseline001:"1"})],config,"c",new Map([["Facility001",{name:"Clinic",lga:"Dutse"}]]));
  expect(result.rows).toHaveLength(0); expect(result.skipped).toBeGreaterThan(0);
 });
 it("requires explicit distinct tracker mappings",()=>{expect(validateTrackerConfig(config)).toEqual(config);expect(()=>validateTrackerConfig({...config,day30:config.baseline})).toThrow();});
 it("does not leak part of an invalid correction into an existing episode",async()=>{
  const result=await trackerEpisodes([event({Surgery0001:"2026-01-01",EyeSide0001:"R",Baseline001:"1",Thirty00001:"0.6"},{updatedAt:"2026-02-01"}),event({Surgery0001:"2026-01-01",EyeSide0001:"R",Baseline001:"0.1",Thirty00001:"invalid"},{updatedAt:"2026-03-01"})],config,"c",new Map([["Facility001",{name:"Clinic",lga:"Dutse"}]]));
  expect(result.rows[0].baseline).toBe(1);expect(result.rows[0].day30).toBe(0.6);
 });
 it("exports stable report event IDs and longitude-first GPS without changing facility geometry",async()=>{
  const gpsConfig=validateGpsConfig({program:"Program0001",stage:"Stage000001",reportId:"Report00001",accuracy:"Accuracy001",capturedAt:"Captured001",facilities:{Clinic:"Facility001"}});
  const report={id:"report-id",facility_name:"Clinic",report_date:"2026-11-01",gps:{lat:11.75,lng:9.33,accuracy:12,captured_at:"2026-11-01T20:38:00Z"}};
  const result=await gpsEvent(report,gpsConfig,"conn");expect(result?.geometry.coordinates).toEqual([9.33,11.75]);expect((await gpsEvent(report,gpsConfig,"conn"))?.event).toBe(result?.event);expect(result?.orgUnit).toBe("Facility001");expect(await gpsEvent({...report,facility_name:"Unmapped"},gpsConfig,"conn")).toBeNull();
 });
});