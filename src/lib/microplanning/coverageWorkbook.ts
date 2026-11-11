import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import type { ExchangeEntry, ExchangeRow, MedicineReturn } from "./coverageExchange";

const COLORS = { navy: "003B5C", blue: "007CB0", teal: "008C82", pale: "EAF5FA", input: "FFF2CC", white: "FFFFFF", ink: "183B4E", green: "008000" };
const headers = ["Entry ID", "State", "LGA", "Ward", "FLHF", "Community", "Settlement", "Target Population", "Total Treated", "Total HHs", "Treated HHs", "Medicine Used (units)", "Allocated (units; reference)", "Unaccounted Balance (units)", "Medicine 1", "Unit 1", "Used 1", "Returned 1", "Damaged 1", "Medicine 2", "Unit 2", "Used 2", "Returned 2", "Damaged 2", "Medicine 3", "Unit 3", "Used 3", "Returned 3", "Damaged 3", "Total Population (new records only)"];
export interface WorkbookAllocation { entryId: string; medicineRequired: number }
export async function buildCoverageWorkbook(entries: ExchangeEntry[], allocations: WorkbookAllocation[], project: string, target: (e: ExchangeEntry) => number) {
  const wb = new ExcelJS.Workbook(); wb.creator = "Amehnities"; wb.created = new Date(); wb.calcProperties.fullCalcOnLoad = true;
  const cover = wb.addWorksheet("Read Me", {properties: {tabColor: {argb: COLORS.navy}}});
  cover.columns = [{width: 30},{width: 95}];
  cover.mergeCells("A1:B1"); cover.getCell("A1").value = "AMEHNITIES • COMMUNITY COVERAGE & MEDICINES";
  cover.getRow(1).height = 42; cover.getCell("A1").font = {name:"Arial",size:16,bold:true,color:{argb:COLORS.white}}; cover.getCell("A1").fill = {type:"pattern",pattern:"solid",fgColor:{argb:COLORS.navy}};
  const notes = [
    ["Project",project], ["Workbook", "WHO-inspired field reporting design • Not an official WHO publication"],
    ["Reporting basis", "One row per community/settlement. Enter cumulative campaign totals, not additional totals. Import replaces supplied values; blank cells leave saved values unchanged."],
    ["Yellow cells", "Complete Total Treated, Total HHs, Treated HHs and medicine quantities. Zero is a reported zero; blank means not reported."],
    ["Community identity", "Keep Entry ID and geography unchanged for listed records. For a new community leave Entry ID blank and enter State, LGA, Ward, FLHF and Community. Add a separate row for each settlement."],
    ["Medicines", "Enter each medicine name, dispensing unit, used, returned and damaged quantities. Medicine Used must equal the total used across medicine slots. Do not combine tablets and bottles into a clinical dose estimate."],
    ["Allocation reference", "Allocated is the saved plan, for reference only. Imported allocation cells do not change the saved allocation. New/unallocated records remain flagged until an administrator allocates them."],
    ["Balance", "Allocated minus used, returned and damaged. Negative balances require stock investigation; positive balances are not yet accounted for. Formula cells are not imported."],
    ["Matching & review", "Exact IDs or unique high-confidence matches within State/LGA/Ward are suggested automatically. Review ambiguous names, duplicates and unknown communities before saving; map to a listed record, add a new record or skip."],
    ["New-record population", "Enter a verified Total Population only for new records. Missing populations and GPS stay unknown; coverage percentages require a valid target population."],
    ["Source", `Current authorized project microplan and saved medicine allocation • Exported ${new Date().toISOString()}`],
  ];
  notes.forEach((n,i) => { const r=cover.getRow(i+3); r.values=n; r.height=i===0?26:52; r.eachCell(c=>{c.font={name:"Arial",size:11,color:{argb:COLORS.ink}};c.alignment={vertical:"middle",wrapText:true};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:i%2?COLORS.white:COLORS.pale}};});r.getCell(1).font={name:"Arial",size:11,bold:true,color:{argb:COLORS.teal}}; });
  const ws=wb.addWorksheet("Coverage", {properties:{tabColor:{argb:COLORS.blue}},pageSetup:{orientation:"landscape",paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:"1:4"}});
  ws.columns=headers.map((h,i)=>({width:i===0?38:i<7?24:i>=14?17:21}));
  ws.mergeCells(1,1,1,headers.length);ws.getCell("A1").value="COMMUNITY COVERAGE • MEDICINE ACCOUNTABILITY";ws.getRow(1).height=34;
  ws.getCell("A1").font={name:"Arial",size:15,bold:true,color:{argb:COLORS.white}};ws.getCell("A1").fill={type:"pattern",pattern:"solid",fgColor:{argb:COLORS.navy}};
  ws.mergeCells(2,1,2,headers.length);ws.getCell("A2").value=project;ws.getCell("A2").font={name:"Arial",size:12,bold:true,color:{argb:COLORS.teal}};
  const h=ws.getRow(4);h.values=[...headers,"Year of Microplanning"];h.height=42;h.eachCell(c=>{c.font={name:"Arial",size:10,bold:true,color:{argb:COLORS.white}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:COLORS.blue}};c.alignment={wrapText:true,vertical:"middle"};});
  const allocated=new Map<string,number>();allocations.forEach(a=>allocated.set(a.entryId,(allocated.get(a.entryId)??0)+a.medicineRequired));
  const rows: (ExchangeEntry | undefined)[] = [...entries, ...Array.from({length:10},()=>undefined)];
  rows.forEach((e,i)=>{
    const r=i+5;const medicine=e?.medicine_returns??[];
    const values: ExcelJS.CellValue[]=[e?.id??"",e?.state??"",e?.lga??"",e?.ward??"",e?.flhf_name??"",e?.community_name??"",e?.settlement_name??"",e?target(e):null,e?.total_treated??null,e?.total_households_reported??null,e?.total_households_treated??null,e?.medicine_used??null,e&&allocated.has(e.id)?allocated.get(e.id)??null:null,{formula:`IF(OR(M${r}="",L${r}=""),"",M${r}-L${r}-SUM(R${r}:S${r},W${r}:X${r},AB${r}:AC${r}))`,result:e?.medicine_used!=null&&allocated.has(e.id)?(allocated.get(e.id)??0)-e.medicine_used-medicine.reduce((s,m)=>s+m.returned+m.damaged,0):""}];
    for(let slot=0;slot<3;slot++){const m=medicine[slot];values.push(m?.name??"",m?.unit??"",m?.used??null,m?.returned??null,m?.damaged??null);}
    values.push(null,e?.year_of_microplanning??entries[0]?.year_of_microplanning??new Date().getFullYear());ws.getRow(r).values=values;ws.getRow(r).height=24;
    ws.getRow(r).eachCell({includeEmpty:true},(c,col)=>{const editable=(col>=9&&col<=12)||col>=15||(!e&&col<=7);c.font={name:"Arial",size:10,color:{argb:editable?"0000FF":COLORS.ink}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:editable?COLORS.input:i%2?COLORS.pale:COLORS.white}};c.alignment={vertical:"middle",wrapText:false};c.border={bottom:{style:"hair",color:{argb:"CADDE5"}}}; if((col>=8&&col<=14)||[17,18,19,22,23,24,27,28,29,30].includes(col)){c.numFmt='#,##0;(#,##0);"-"';if(editable)c.dataValidation={type:"whole",operator:"greaterThanOrEqual",formulae:[0],allowBlank:true,showErrorMessage:true,error:"Enter a non-negative whole number."};}if(col===14)c.font={name:"Arial",size:10,color:{argb:"000000"}};});
  });
  ws.views=[{state:"frozen",ySplit:4,xSplit:7}];ws.autoFilter={from:{row:4,column:1},to:{row:rows.length+4,column:headers.length}};
  return wb;
}
export async function exportCoverageWorkbook(entries: ExchangeEntry[], allocations: WorkbookAllocation[], project: string, target: (e: ExchangeEntry)=>number) {
  const wb=await buildCoverageWorkbook(entries,allocations,project,target);const buffer=await wb.xlsx.writeBuffer();
  const blob=new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${project.replace(/[^a-z0-9]/gi,"_")}_Coverage_Medicines.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function parseCoverageWorkbook(file: File): Promise<ExchangeRow[]> {
  if(file.size>20*1024*1024)throw new Error("Workbook must be smaller than 20 MB.");
  const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});const sheet=wb.Sheets.Coverage;
  if(!sheet)throw new Error('The workbook must contain a "Coverage" sheet. Download the template first.');
  const cells=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:""});
  const headerIndex=cells.findIndex(r=>r.includes("Community")&&r.includes("Total Treated"));
  if(headerIndex<0)throw new Error("Coverage column headings were not found.");
  const head=cells[headerIndex].map(String);const out: ExchangeRow[]=[];
  for(let i=headerIndex+1;i<cells.length;i++){
    const values=cells[i];const get=(key:string)=>values[head.indexOf(key)]??"";const text=(key:string)=>String(get(key)).trim();
    if(!["Total Treated","Total HHs","Treated HHs","Medicine Used (units)","Used 1","Returned 1","Damaged 1","Used 2","Returned 2","Damaged 2","Used 3","Returned 3","Damaged 3"].some(k=>get(k)!==""))continue;
    const errors:string[]=[];const num=(key:string):number|undefined=>{const v=get(key);if(v==="")return undefined;const n=typeof v==="number"?v:Number(String(v).replace(/,/g,""));if(!Number.isFinite(n)){errors.push(`${key} is not a number.`);return undefined;}return n;};
    const medicines:MedicineReturn[]=[];
    for(let slot=1;slot<=3;slot++){const name=text(`Medicine ${slot}`),unit=text(`Unit ${slot}`),used=num(`Used ${slot}`),returned=num(`Returned ${slot}`),damaged=num(`Damaged ${slot}`);if(name||unit||used!==undefined||returned!==undefined||damaged!==undefined){if(used===undefined)errors.push(`Used ${slot} is required for a reported medicine.`);medicines.push({name,unit,used:used??0,returned:returned??0,damaged:damaged??0});}}
    out.push({row:i+1,entryId:text("Entry ID"),state:text("State"),lga:text("LGA"),ward:text("Ward"),flhf:text("FLHF"),community:text("Community"),settlement:text("Settlement"),treated:num("Total Treated"),households:num("Total HHs"),treatedHouseholds:num("Treated HHs"),medicineUsed:num("Medicine Used (units)"),population:num("Total Population (new records only)"),year:num("Year of Microplanning"),medicines,errors});
    if(out.length>20000)throw new Error("Import at most 20,000 community rows per workbook.");
  }
  return out;
}