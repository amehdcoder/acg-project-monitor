import { describe, expect, it } from "vitest";
import { buildCoverageWorkbook, parseCoverageWorkbook } from "../coverageWorkbook";
const entry={id:"record",state:"Kano",lga:"Dala",ward:"Gwarmai",flhf_name:"PHC",community_name:"Central",settlement_name:null};
describe("Coverage workbook round trip",()=>{
 it("ignores unfilled reference rows and imports supplied treatment and medicine fields",async()=>{
  const wb=await buildCoverageWorkbook([entry],[{entryId:"record",medicineRequired:200}],"Project",()=>100);
  const ws=wb.getWorksheet("Coverage");if(!ws)throw new Error("Missing sheet");
  const empty=await wb.xlsx.writeBuffer();expect(await parseCoverageWorkbook({size:empty.byteLength,arrayBuffer:async()=>empty} as File)).toEqual([]);
  ws.getCell("I5").value=80;ws.getCell("J5").value=20;ws.getCell("K5").value=15;ws.getCell("L5").value=160;
  ws.getCell("L5").value=200;ws.getCell("M5").value=160;ws.getCell("N5").value=5;ws.getCell("O5").value=5;ws.getCell("P5").value=30;
  const b=await wb.xlsx.writeBuffer();const rows=await parseCoverageWorkbook({size:b.byteLength,arrayBuffer:async()=>b} as File);
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({entryId:"record",treated:80,households:20,treatedHouseholds:15,stock:{received:200,used:160,lost:5,expired:5,returned:30}});
  expect(rows[0]).not.toHaveProperty("allocated");
 });
 it("does not invent actual receipts or reclassify legacy damage",async()=>{
  const wb=await buildCoverageWorkbook([{...entry,medicine_used:160,medicine_returns:[{name:"A",unit:"tablets",used:160,returned:30,damaged:10}]}],[{entryId:"record",medicineRequired:200}],"Project",()=>100);
  const ws=wb.getWorksheet("Coverage");if(!ws)throw new Error("Missing sheet");
  expect(ws.getCell("L5").value).toBeNull();expect(ws.getCell("N5").value).toBeNull();expect(ws.getCell("O5").value).toBeNull();expect(ws.getCell("M5").value).toBe(160);
 });
});