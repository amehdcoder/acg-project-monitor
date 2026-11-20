import ExcelJS from 'exceljs';
import type { GpsQualityReport } from './gpsQuality';
import { GPS_COLOUR, GPS_DOCUMENT as C, GPS_LABEL, gpsFindingAction } from './gpsFindingPresentation';

export async function buildGpsQualityWorkbook(report: GpsQualityReport, projectName: string, map: Uint8Array) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Amehnities'; wb.created = new Date();
  const argb = (s: string) => `FF${s.slice(1)}`;
  const sheet = (name: string, widths: number[], title: string, subtitle: string) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 5 }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = widths.map(width => ({ width }));
    ws.mergeCells(1, 1, 2, widths.length); ws.getCell('A1').value = title;
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(C.blue) } };
    ws.getCell('A1').font = { name: 'Arial', size: 19, bold: true, color: { argb: argb(C.paper) } };
    ws.getCell('A1').alignment = { vertical: 'middle', wrapText: true }; ws.getRow(1).height = 26; ws.getRow(2).height = 26;
    ws.mergeCells(3, 1, 3, widths.length); ws.getCell('A3').value = subtitle; ws.getRow(3).height = 36;
    ws.getCell('A3').font = { name: 'Arial', size: 11, color: { argb: argb(C.ink) } }; ws.getCell('A3').alignment = { wrapText: true, vertical: 'middle' };
    ws.getCell('A4').value = ''; ws.getRow(4).height = 10;
    ws.headerFooter.oddFooter = '&LAmehnities • GPS quality review&CPage &P of &N&R&D';
    return ws;
  };
  const stamp = `${projectName} • ${wb.created.toISOString().slice(0, 10)} UTC • Current dashboard selection`;
  const overview = sheet('Overview', [35, 24, 85], 'GPS CAPTURE QUALITY • PROJECT REVIEW', stamp);
  overview.addRow(['Measure', 'Value', 'Interpretation']);
  overview.addRow(['Usable GPS points', report.total, 'Deduplicated by place and recorded coordinates; includes FLHF locations.']);
  overview.addRow(['Accepted by boundary screen (%)', report.score, 'Inside recorded LGA or within configured boundary tolerance; not independently verified GPS accuracy.']);
  overview.addRow(['Missing community / settlement GPS', report.missing, 'Excluded from usable-point denominator; FLHF missing coordinates are not included here.']);
  for (const [status, count] of Object.entries(report.counts)) overview.addRow([GPS_LABEL[status as keyof typeof GPS_LABEL], count, gpsFindingAction(status as keyof typeof GPS_LABEL)]);
  overview.addRow(['Plain-English insights', '', '']);
  for (const i of report.insights) overview.addRow(['Review observation', '', i.text]);
  const findings = sheet('Findings', [38, 17, 30, 22, 25, 24, 14, 14, 24, 25, 18, 36, 65, 25], 'GPS FINDINGS • FIELD VERIFICATION REGISTER', stamp);
  findings.addRow(['Record ID', 'Point type', 'Name', 'Recorded State', 'Recorded LGA', 'Ward', 'Latitude', 'Longitude', 'Located State', 'Located LGA', 'Km to recorded LGA', 'Finding', 'Recommended verification', 'Map link']);
  report.findings.forEach(f => {
    const r = findings.addRow([f.entryId, f.kind, f.name, f.state, f.lga, f.ward, f.lat, f.lng, f.foundState ?? 'Not resolved', f.foundLga ?? 'Not resolved', f.kmFromLga, GPS_LABEL[f.status], gpsFindingAction(f.status), { text: 'View recorded GPS', hyperlink: `https://www.google.com/maps?q=${f.lat},${f.lng}` }]);
    r.getCell(7).numFmt = r.getCell(8).numFmt = '0.00000'; r.getCell(11).numFmt = '0.00';
    r.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(GPS_COLOUR[f.status]) } };
    r.getCell(12).font = { name: 'Arial', bold: true, color: { argb: argb(['border', 'near_border', 'unknown_lga'].includes(f.status) ? C.ink : C.paper) } };
  });
  findings.autoFilter = { from: 'A5', to: 'N5' }; findings.pageSetup.printTitlesRow = '1:5';
  const mapSheet = sheet('Findings map', Array(12).fill(18), 'GPS FINDINGS • SPATIAL EVIDENCE', stamp);
  const image = wb.addImage({ buffer: map as unknown as ExcelJS.Buffer, extension: 'png' });
  mapSheet.addImage(image, { tl: { col: 0, row: 5 }, ext: { width: 1280, height: 896 } });
  for (let r = 6; r <= 51; r++) mapSheet.getRow(r).height = 15;
  mapSheet.pageSetup.printArea = 'A1:L51'; mapSheet.pageSetup.fitToHeight = 1;
  const methods = sheet('Sources & methods', [35, 110], 'METHODS, SOURCES & LIMITATIONS', 'WHO-inspired public-health reporting style • Prepared by Amehnities, not a WHO-certified template');
  for (const row of [
    ['Boundary source', 'OSGOF / OCHA COD-AB v01, CC BY-IGO: https://data.humdata.org/dataset/cod-ab-nga'],
    ['Coordinates', 'WGS 84 decimal degrees. The workbook preserves submitted latitude/longitude; no points are automatically moved.'],
    ['Boundary screening', 'Existing dashboard classification and counts are preserved. Within 1 km and 1–5 km boundary categories are accepted by this screening convention, not proof of a correct field capture.'],
    ['Verification', 'A mismatch may reflect capture, typing, recorded geography or source-boundary uncertainty. Confirm the source submission and local boundary before changing any record.'],
    ['Distance', 'Approximate shortest distance to the recorded LGA polygon edge, rounded to 0.01 km; not travel distance or measured device accuracy.'],
    ['Map scope', 'Main map frames recorded States and in-country findings; inset includes all findings. Only findings are plotted, not all accepted points. Overlap does not remove rows from the register.'],
    ['Missing evidence', 'Unresolved geographic names remain Not resolved; missing distances remain blank, never zero. No inferred population, habitation or satellite observations.'],
    ['Privacy', 'Export uses only the current authorized dashboard selection. No personal CDD banking details included; protect the downloaded location register.'],
  ]) methods.addRow(row);
  for (const ws of [overview, findings, methods]) {
    ws.eachRow((row, n) => {
      if (n < 5) return;
      row.height = ws === findings ? 48 : 60;
      row.eachCell({ includeEmpty: true }, cell => {
        if (!(ws === findings && cell.col === 'L' && n > 5)) cell.font = { name: 'Arial', size: 11, color: { argb: argb(C.ink) } };
        cell.alignment = { vertical: 'middle', wrapText: true };
        if (!cell.fill || cell.fill.type !== 'pattern') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(n % 2 ? C.light : C.paper) } };
      });
    });
    if (ws !== methods) ws.getRow(5).eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(C.ink) } }; cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: argb(C.paper) } }; });
  }
  return wb.xlsx.writeBuffer();
}