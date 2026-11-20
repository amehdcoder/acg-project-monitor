import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildGpsQualityWorkbook } from '../gpsQualityWorkbook';
import type { GpsQualityReport } from '../gpsQuality';

describe('GPS findings workbook data integrity', () => {
  it('preserves original GPS, unresolved distances and every finding with embedded spatial evidence', async () => {
    const report: GpsQualityReport = { total: 3, missing: 1, score: 33.3, clusters: [], insights: [], counts: { inside: 1, border: 0, near_border: 0, swapped: 1, other_lga: 0, other_state: 0, outside_nigeria: 0, unknown_lga: 1 }, findings: [
      { entryId: 'a', kind: 'settlement', name: 'East', state: 'Kano', lga: 'Gabasawa', ward: 'Ward A', lat: 8.8, lng: 12.2, status: 'swapped', foundState: 'Yobe', foundLga: 'Damaturu', kmFromLga: 201.23 },
      { entryId: 'b', kind: 'flhf', name: 'Clinic', state: 'Kano', lga: 'Unknown', ward: '', lat: 12.2, lng: 8.8, status: 'unknown_lga', foundState: 'Kano', foundLga: 'Gabasawa', kmFromLga: null },
    ] };
    const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
    const bytes = await buildGpsQualityWorkbook(report, 'Real scoped project', png);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes);
    const ws = wb.getWorksheet('Findings');
    expect(ws?.rowCount).toBe(7);
    expect(ws?.getCell('G6').value).toBe(8.8);
    expect(ws?.getCell('H6').value).toBe(12.2);
    expect(ws?.getCell('K6').value).toBe(201.23);
    expect(ws?.getCell('K7').value).toBeNull();
    expect(wb.getWorksheet('Overview')?.getCell('B6').value).toBe(3);
    expect(wb.getWorksheet('Findings map')?.getImages()).toHaveLength(1);
    expect(wb.getWorksheet('Findings map')?.getImages()[0].range).toMatchObject({ ext: { width: 1280, height: 896 } });
  });
});