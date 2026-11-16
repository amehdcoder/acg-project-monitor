import ExcelJS from 'exceljs';
import type { AreaRow, LandEvidence } from './areaEvidence';

export function buildAreaWorkbook(state: string, lga: string, lat: number, lng: number, rows: AreaRow[], evidence: LandEvidence[], verdict: string, evidenceStatus: string) {
  const wb = new ExcelJS.Workbook(); wb.creator='Amehnities'; wb.created=new Date();
  const overview=wb.addWorksheet('Area evidence');
  overview.addRows([['AMEHNITIES · GEOSPATIAL FIELD EVIDENCE'],['WHO-inspired planning workbook · not a WHO certification'],['State',state],['LGA',lga],['Inspection latitude',lat],['Inspection longitude',lng],['Nearby evidence (2 km)',verdict],['Public lookup',evidenceStatus],['Generated UTC',new Date().toISOString()],['Coverage','Entire selected LGA within the visible project/ward scope; not an exhaustive census'],['Population','Submission values only; missing is unknown, not zero. Repeated settlements may overlap; do not sum as an LGA census.'],['Interpretation','Buildings, named places, forests and water features do not prove presence or absence of people. Confirm occupancy in the field.'],['Imagery','Esri World Imagery provider mosaic; acquisition dates and native resolution vary. Zoom beyond native detail adds no evidence.'],['Reference','Bundled GRID3 Nigeria settlement registry; source vintage not provided in the local shard.'],['Public features','OpenStreetMap contributors; incomplete volunteered data, retrieved on demand in a 2 km radius.']]);
  const locations=wb.addWorksheet('LGA settlements');
  locations.addRow(['Community / settlement','Ward','Latitude','Longitude','Population','Population source','Location source','Evidence status','Planning year','Children 5–9 male','Children 5–9 female']);
  rows.forEach(r=>locations.addRow([r.name,r.ward,r.lat,r.lng,r.population,r.populationSource,r.locationSource,r.status,r.year,r.male,r.female]));
  const features=wb.addWorksheet('Nearby land evidence'); features.addRow(['Name','Mapped feature','Latitude','Longitude','Tagged population','Population source','Feature source']);
  evidence.forEach(e=>features.addRow([e.name,e.feature,e.lat,e.lng,e.population,e.population == null ? 'Not reported' : 'OpenStreetMap population tag — date/method unverified',e.source]));
  const review=wb.addWorksheet('Field verification'); review.addRows([['Location name','Latitude','Longitude','Observed land cover','Buildings observed','Occupancy verified','Verified population','Population source / date','Verifier','Notes'],['',lat,lng,'','','','','','','']]);
  for(const sheet of wb.worksheets) {
    sheet.views=[{state:'frozen',ySplit:1}]; sheet.getRow(1).height=32;
    sheet.getRow(1).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF007FA3'}};cell.font={bold:true,color:{argb:'FFFFFFFF'},size:12};});
    sheet.columns.forEach((c,i)=>{c.width= i===0?40:28;});
    sheet.eachRow((row,index)=>{row.alignment={vertical:'top',wrapText:true};if(index>1){row.height=36;row.eachCell(cell=>{cell.font={size:11};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:index%2?'FFEAF5F7':'FFFFFFFF'}};});}});
    sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
  }
  locations.autoFilter='A1:K1'; features.autoFilter='A1:G1';
  return wb;
}