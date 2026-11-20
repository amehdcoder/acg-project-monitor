import type { GpsQualityReport } from './gpsQuality';
import type { AdminBoundary, NigeriaAdminBoundaries } from './nigeriaAdminBoundaries';
import { adminStateKey } from './nigeriaAdminBoundaries';
import { GPS_COLOUR, GPS_DOCUMENT as C, GPS_LABEL } from './gpsFindingPresentation';

type Ring = number[][];
function polygons(f: AdminBoundary): Ring[][] {
  return f.geometry.type === 'Polygon' ? [f.geometry.coordinates as Ring[]] : f.geometry.coordinates as Ring[][];
}
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** Local cartography only: no tiles, external requests, coordinate changes or credentials. */
export async function renderGpsQualityMap(report: GpsQualityReport, boundaries: NigeriaAdminBoundaries): Promise<Uint8Array> {
  const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1120;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not prepare the workbook map.');
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, 1600, 1120);
  ctx.fillStyle = C.ink; ctx.font = 'bold 30px Arial'; ctx.fillText('GPS FINDINGS • GEOGRAPHIC REVIEW', 40, 48);
  ctx.font = '18px Arial'; ctx.fillText('Recorded coordinates, not corrected locations • WGS 84 • North ↑', 40, 78);
  const keys = new Set(report.findings.map(f => adminStateKey(f.state)));
  const states = boundaries.states.features.filter(f => keys.has(adminStateKey(f.properties.state)));
  const region = states.length ? states : boundaries.states.features;
  const extent = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of region) for (const poly of polygons(f)) for (const ring of poly) for (const [x, y] of ring) {
    extent[0] = Math.min(extent[0], x); extent[1] = Math.min(extent[1], y); extent[2] = Math.max(extent[2], x); extent[3] = Math.max(extent[3], y);
  }
  for (const f of report.findings) if (f.foundState) {
    extent[0] = Math.min(extent[0], f.lng); extent[1] = Math.min(extent[1], f.lat);
    extent[2] = Math.max(extent[2], f.lng); extent[3] = Math.max(extent[3], f.lat);
  }
  const drawPanel = async (box: number[], bounds: number[], all: boolean) => {
    const [left, top, width, height] = box;
    const mid = (bounds[1] + bounds[3]) / 2, cos = Math.cos(mid * Math.PI / 180);
    const dx = Math.max(.01, bounds[2] - bounds[0]), dy = Math.max(.01, bounds[3] - bounds[1]);
    const scale = Math.min((width - 50) / (dx * cos), (height - 50) / dy);
    const project = (x: number, y: number) => [left + width / 2 + (x - (bounds[0] + bounds[2]) / 2) * cos * scale, top + height / 2 - (y - mid) * scale];
    ctx.fillStyle = C.light; ctx.fillRect(left, top, width, height);
    ctx.save(); ctx.beginPath(); ctx.rect(left, top, width, height); ctx.clip();
    const path = (f: AdminBoundary) => {
      ctx.beginPath(); for (const poly of polygons(f)) for (const ring of poly) {
        ring.forEach(([x, y], i) => { const [px, py] = project(x, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.closePath();
      }
    };
    for (let i = 0; i < boundaries.lgas.features.length; i++) {
      const f = boundaries.lgas.features[i];
      path(f); ctx.fillStyle = keys.has(adminStateKey(f.properties.state)) ? C.aqua : C.paper; ctx.fill('evenodd');
      ctx.strokeStyle = C.grey; ctx.lineWidth = .65; ctx.stroke();
      if (i % 35 === 0) await pause();
    }
    for (const f of boundaries.states.features) {
      path(f); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
      if (keys.has(adminStateKey(f.properties.state)) || report.findings.some(point => adminStateKey(point.foundState) === adminStateKey(f.properties.state))) {
        const [x, y] = project(f.properties.center_lon, f.properties.center_lat);
        ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = C.ink; ctx.fillText(f.properties.state, x, y);
      }
    }
    ctx.textAlign = 'left';
    const ordered = [...report.findings].sort((a, b) => Number(a.status !== 'border' && a.status !== 'near_border') - Number(b.status !== 'border' && b.status !== 'near_border'));
    for (let i = 0; i < ordered.length; i++) {
      const f = ordered[i], [x, y] = project(f.lng, f.lat);
      ctx.beginPath(); ctx.arc(x, y, all ? 3 : 5, 0, Math.PI * 2); ctx.fillStyle = GPS_COLOUR[f.status]; ctx.fill(); ctx.strokeStyle = C.paper; ctx.lineWidth = 1.2; ctx.stroke();
      if (i % 350 === 0) await pause();
    }
    ctx.restore(); ctx.strokeStyle = C.grey; ctx.lineWidth = 1; ctx.strokeRect(left, top, width, height);
  };
  await drawPanel([40, 110, 1050, 820], extent, false);
  ctx.fillStyle = C.ink; ctx.font = 'bold 19px Arial'; ctx.fillText('ALL FINDINGS / NIGERIA CONTEXT', 1130, 130);
  const global = [2.5, 4, 15, 14];
  for (const f of report.findings) { global[0] = Math.min(global[0], f.lng); global[1] = Math.min(global[1], f.lat); global[2] = Math.max(global[2], f.lng); global[3] = Math.max(global[3], f.lat); }
  await drawPanel([1130, 150, 430, 320], global, true);
  ctx.fillStyle = C.ink; ctx.font = 'bold 22px Arial'; ctx.fillText('LEGEND • FINDINGS ONLY', 1130, 515);
  let y = 555;
  for (const s of Object.keys(GPS_LABEL) as (keyof typeof GPS_LABEL)[]) {
    if (s === 'inside') continue;
    ctx.fillStyle = GPS_COLOUR[s]; ctx.beginPath(); ctx.arc(1140, y - 5, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.ink; ctx.font = '16px Arial'; ctx.fillText(`${GPS_LABEL[s]} (${report.counts[s]})`, 1160, y); y += 38;
  }
  ctx.font = '17px Arial'; ctx.fillText('Thick outline: State boundary', 1130, 860); ctx.fillText('Thin outline: LGA boundary', 1130, 890);
  ctx.font = '18px Arial'; ctx.fillText('Source: OSGOF / OCHA COD-AB v01 • https://data.humdata.org/dataset/cod-ab-nga • CC BY-IGO', 40, 978);
  ctx.fillText('Main panel: recorded States and in-country findings. Inset includes all findings, including out-of-country coordinates.', 40, 1013);
  ctx.fillText('No satellite or habitation inference. Overlapping points remain separate rows in the Findings sheet.', 40, 1048);
  ctx.fillText('Boundary tolerance is a screening convention, not proof of capture accuracy. Verify original records before editing.', 40, 1083);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Map image generation failed.')), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}