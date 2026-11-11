import { describe, expect, it } from "vitest";
import { buildCoverageWorkbook, parseCoverageWorkbook } from "../coverageWorkbook";
const entry={id:"record",state:"Kano",lga:"Dala",ward:"Gwarmai",flhf_name:"PHC",community_name:"Central",settlement_name:null};
describe("Coverage workbook round trip",()=>{
 it("ignores unfilled reference rows and imports supplied treatment and medicine fields",async()=>{
  const wb=await buildCoverageWorkbook([entry],[{entryId:"record",medicineRequired:200}],"Project",()=>100);
  const ws=wb.getWorksheet("Coverage");if(!ws)throw new Error("Missing sheet");
  const empty=await wb.xlsx.writeBuffer();expect(await parseCoverageWorkbook({size:empty.byteLength,arrayBuffer:async()=>empty} as File)).toEqual([]);
  ws.getCell("I5").value=80;ws.getCell("J5").value=20;ws.getCell("K5").value=15;ws.getCell("L5").value=160;
  ws.getCell("O5").value="Albendazole";ws.getCell("P5").value="Tablets";ws.getCell("Q5").value=160;ws.getCell("R5").value=30;ws.getCell("S5").value=2;
  const b=await wb.xlsx.writeBuffer();const rows=await parseCoverageWorkbook({size:b.byteLength,arrayBuffer:async()=>b} as File);
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({entryId:"record",treated:80,households:20,treatedHouseholds:15,medicineUsed:160,medicines:[{name:"Albendazole",unit:"Tablets",used:160,returned:30,damaged:2}]});
  expect(rows[0]).not.toHaveProperty("allocated");
 });
});