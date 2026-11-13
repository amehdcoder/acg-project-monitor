import { describe, expect, it } from "vitest";
import { alignStock, canAlignStock, medicineAccounted, medicineReceived, coveragePatch, coverageTargetPopulation, createCoverageMatcher, mergeAllocationPlan, validateCoverageRow, type ExchangeRow } from "../coverageExchange";
const entry={id:"one",state:"Kano",lga:"Dala",ward:"Gwarmai",flhf_name:"PHC",community_name:"Gwarmai Central",settlement_name:null,total_households_reported:10,total_households_treated:5};
const row:ExchangeRow={row:5,entryId:"",state:"Kano",lga:"Dala",ward:"Gwarmai",flhf:"PHC",community:"Gwarmai Central",settlement:"",treated:80,households:20,treatedHouseholds:15,medicineUsed:160,medicines:[],errors:[]};
describe("Coverage Excel exchange",()=>{
 it("fuzzy-matches typed LGA, Ward, FLHF and community while retaining the associated target and totals",()=>{
  const typed={...row,lga:"Dalaa",ward:"Gwarmai Wrd",flhf:"Primary Health Centr",community:"Gwarmai Centrl",targetPopulation:100};
  const source={...entry,flhf_name:"Primary Health Centre"};
  expect(createCoverageMatcher([source])(typed)).toMatchObject({id:"one",status:"fuzzy"});
  expect(coveragePatch(typed,source)).toMatchObject({coverage_target_population:100,total_treated:80,total_households_reported:20,total_households_treated:15,medicine_used:160});
 });
 it("never fuzzy-matches a typed row outside its State",()=>{
  expect(createCoverageMatcher([entry])({...row,state:"Jigawa",lga:"Dalaa"}).candidates).toEqual([]);
 });
 it("saves a supplied target without creating total population or age counts",()=>{
  const patch=coveragePatch({...row,targetPopulation:100});
  expect(patch.coverage_target_population).toBe(100);expect(patch).not.toHaveProperty("estimated_total_population");expect(patch).not.toHaveProperty("estimated_children_5_14");
 });
 it("uses a saved explicit Coverage target, including zero, and preserves derived targets otherwise",()=>{
  expect(coverageTargetPopulation({...entry,coverage_target_population:120},90)).toBe(120);
  expect(coverageTargetPopulation({...entry,coverage_target_population:0},90)).toBe(0);
  expect(coverageTargetPopulation(entry,90)).toBe(90);
 });
 it("leaves unchanged prefilled target populations derived",()=>{
  expect(coveragePatch({...row,entryId:"one",targetPopulation:100},entry,100)).not.toHaveProperty("coverage_target_population");
  expect(coveragePatch({...row,entryId:"one",targetPopulation:120},entry,100).coverage_target_population).toBe(120);
 });
 it("validates typed targets and their relation to treated and total population",()=>{
  expect(validateCoverageRow({...row,targetPopulation:79})).toContain("Total Treated cannot exceed Target Population.");
  expect(validateCoverageRow({...row,targetPopulation:100,population:90})).toContain("Target Population cannot exceed Total Population.");
  expect(validateCoverageRow({...row,targetPopulation:-1}).some(e=>e.includes("Target Population must"))).toBe(true);
  expect(()=>coveragePatch({...row,treated:undefined,targetPopulation:40},{...entry,total_treated:80})).toThrow("Target Population");
 });
 const stockRow:ExchangeRow={...row,medicineUsed:undefined,stock:{received:200,used:160,lost:5,expired:5,returned:30}};
 it("requires received = used + lost + expired + returned to FLHF",()=>{expect(validateCoverageRow(stockRow)).toEqual([]);expect(validateCoverageRow({...stockRow,stock:{...stockRow.stock,received:201}}).some(e=>e.includes("Quantity Received must equal"))).toBe(true);});
 it("aligns only received to the four accounted quantities",()=>{
  const input={...stockRow,stock:{...stockRow.stock,received:180}};
  expect(canAlignStock(input)).toBe(true);expect(alignStock(input).stock).toEqual({received:200,used:160,lost:5,expired:5,returned:30});expect(input.stock.received).toBe(180);
 });
 it("blocks balancing with missing, negative, fractional or overflowing quantities",()=>{
  for(const used of [undefined,-1,1.5,2147483647]){const input={...stockRow,stock:{...stockRow.stock,used}};expect(canAlignStock(input)).toBe(false);expect(validateCoverageRow(input).length).toBeGreaterThan(0);}
 });
 it("requires explicit zeroes and accepts a fully zero stock report",()=>{expect(validateCoverageRow({...stockRow,stock:{received:0,used:0,lost:0,expired:0,returned:0}})).toEqual([]);expect(validateCoverageRow({...stockRow,stock:{received:0,used:0}}).length).toBeGreaterThan(0);});
 it("persists all five quantities without modifying saved allocation",()=>{
  const patch=coveragePatch(stockRow);expect(patch.medicine_used).toBe(160);expect(patch.medicine_returns).toEqual([{name:"Reported medicine quantities",unit:"units",received:200,used:160,lost:5,expired:5,returned:30,damaged:10}]);expect(patch.medicine_reversed_to).toBe("FLHF");expect(patch).not.toHaveProperty("allocation");
 });
 it("accounts lost and expired once and preserves old damage accounting",()=>{expect(medicineAccounted({name:"A",unit:"units",used:160,returned:30,damaged:10,lost:5,expired:5})).toBe(40);expect(medicineAccounted({name:"A",unit:"units",used:160,returned:30,damaged:10})).toBe(40);expect(medicineReceived([{name:"A",unit:"units",used:160,returned:30,damaged:10,received:200}])).toBe(200);});
 it("rejects treated population overflow and invalid reporting years",()=>{expect(validateCoverageRow({...row,population:79})).toContain("Total Treated cannot exceed Total Population.");expect(validateCoverageRow({...row,year:2026.5}).length).toBeGreaterThan(0);});
 it("checks treatment against saved population and rejects conflicting medicine formats",()=>{expect(()=>coveragePatch({...row,households:undefined,treatedHouseholds:undefined},{...entry,estimated_total_population:79})).toThrow("saved Total Population");expect(validateCoverageRow({...stockRow,medicineUsed:159}).some(e=>e.includes("not both"))).toBe(true);});
 it("populates the three coverage totals and shared reconciliation quantity",()=>expect(coveragePatch(row)).toEqual({total_treated:80,total_households_reported:20,total_households_treated:15,medicine_used:160}));
 it("preserves blank values rather than clearing saved data",()=>expect(coveragePatch({...row,treated:undefined,households:undefined,treatedHouseholds:undefined,medicineUsed:undefined})).toEqual({}));
 it("matches normalized geography and a unique community",()=>expect(createCoverageMatcher([entry])({...row,ward:"GWARMAI WARD"}).id).toBe("one"));
 it("suggests a high-confidence fuzzy spelling match",()=>expect(createCoverageMatcher([entry])({...row,community:"Gwarmai Centrl"}).status).toBe("fuzzy"));
 it("does not match communities across wards or unauthorized IDs",()=>{expect(createCoverageMatcher([entry])({...row,ward:"Other"}).id).toBeUndefined();expect(createCoverageMatcher([entry])({...row,entryId:"other-project"}).id).toBeUndefined();});
 it("does not auto-match ambiguous communities",()=>expect(createCoverageMatcher([entry,{...entry,id:"two"}])(row).status).toBe("review"));
 it("rejects household totals below treated households",()=>expect(validateCoverageRow({...row,households:14})).toContain("Treated HHs cannot exceed Total HHs."));
 it("checks partial household uploads against saved values",()=>expect(()=>coveragePatch({...row,households:undefined,treatedHouseholds:15},entry)).toThrow("saved Total HHs"));
 it("rejects negative or fractional treatment totals",()=>{expect(validateCoverageRow({...row,treated:-1}).length).toBeGreaterThan(0);expect(validateCoverageRow({...row,treated:1.5}).length).toBeGreaterThan(0);});
 it("saves medicine-specific usage and rejects inconsistent sums",()=>{const r={...row,medicineUsed:undefined,medicines:[{name:"Albendazole",unit:"Tablets",used:120,returned:20,damaged:3}]};expect(coveragePatch(r).medicine_used).toBe(120);expect(coveragePatch(r).medicine_returns).toEqual(r.medicines);expect(()=>coveragePatch({...r,medicineUsed:121})).toThrow("sum");});
 it("retains latest allocation IDs and untouched saved allocations on upload",()=>expect(mergeAllocationPlan([{id:"saved",lga:"Dala",amount:"100"},{id:"kept",lga:"Bichi",amount:"200"}],[{lga:"DALA",amount:"150"}])).toEqual([{id:"saved",lga:"DALA",amount:"150"},{id:"kept",lga:"Bichi",amount:"200"}]));
});