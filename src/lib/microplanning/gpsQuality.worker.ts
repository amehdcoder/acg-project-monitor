import { analyseGpsQuality } from './gpsQuality';

self.onmessage = async ({ data }) => {
  try {
    if (data.kind === 'analyse') {
      self.postMessage({ kind: 'report', report: analyseGpsQuality(data.entries, data.lgas) });
    } else if (data.kind === 'export') {
      const { buildGpsQualityWorkbook } = await import('./gpsQualityWorkbook');
      const buffer = await buildGpsQualityWorkbook(data.report, data.projectName, data.map);
      self.postMessage({ kind: 'workbook', buffer });
    }
  } catch (error) {
    self.postMessage({ kind: 'error', message: error instanceof Error ? error.message : 'GPS review could not be prepared.' });
  }
};