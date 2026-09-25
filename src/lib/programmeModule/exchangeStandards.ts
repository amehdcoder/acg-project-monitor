export type ExchangeObservation = {
  indicatorKey: string;
  remoteId: string;
  value: number;
  categoryOptionCombo?: string | null;
  dimensions?: Record<string, string> | null;
};

export type AdxDocumentInput = {
  orgUnit: string;
  dataSet: string;
  period: string;
  observations: ExchangeObservation[];
  completeDate?: string;
  exportedAt?: string;
};

export type SdmxDocumentInput = {
  agencyId: string;
  dataflowId: string;
  dataflowVersion?: string;
  period: string;
  observations: ExchangeObservation[];
  defaults?: Record<string, string>;
};

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
};
const xml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
const csv = (value: unknown) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function dhisPeriodToIsoInterval(period: string): string {
  if (/^\d{4}$/.test(period)) return `${period}-01-01/P1Y`;
  if (/^\d{4}Q[1-4]$/.test(period)) {
    const quarter = Number(period.slice(-1));
    return `${period.slice(0, 4)}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01/P3M`;
  }
  if (/^\d{6}$/.test(period)) {
    const month = Number(period.slice(4));
    if (month >= 1 && month <= 12) return `${period.slice(0, 4)}-${period.slice(4)}-01/P1M`;
  }
  if (/^\d{4}-\d{2}-\d{2}\/P(?:1M|3M|1Y)$/.test(period)) return period;
  throw new Error("Reporting period must be YYYYMM, YYYYQn, YYYY, or an ISO-8601 interval.");
}

function validateObservations(observations: ExchangeObservation[]) {
  if (!observations.length) throw new Error("At least one observation is required.");
  observations.forEach((observation, index) => {
    if (!observation.remoteId.trim()) throw new Error(`Observation ${index + 1} has no mapped remote indicator.`);
    if (!Number.isFinite(observation.value)) throw new Error(`Observation ${index + 1} has an invalid value.`);
  });
}

export function buildAdxXml(input: AdxDocumentInput): string {
  if (!input.orgUnit.trim()) throw new Error("ADX requires an organisation unit.");
  if (!input.dataSet.trim()) throw new Error("ADX requires a data set.");
  validateObservations(input.observations);
  const period = dhisPeriodToIsoInterval(input.period);
  const exported = input.exportedAt ?? new Date().toISOString();
  const completeDate = input.completeDate ?? new Date().toISOString().slice(0, 10);
  const values = input.observations.map((item) => {
    const dimensions = Object.entries(item.dimensions ?? {})
      .filter(([key, value]) => key.trim() && value.trim())
      .map(([key, value]) => ` ${xml(key)}="${xml(value)}"`).join("");
    const category = item.categoryOptionCombo ? ` categoryOptionCombo="${xml(item.categoryOptionCombo)}"` : "";
    return `    <dataValue dataElement="${xml(item.remoteId)}" value="${xml(item.value)}"${category}${dimensions}/>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<adx xmlns="urn:ihe:qrph:adx:2015" exported="${xml(exported)}">\n  <group orgUnit="${xml(input.orgUnit)}" dataSet="${xml(input.dataSet)}" period="${xml(period)}" completeDate="${xml(completeDate)}">\n${values}\n  </group>\n</adx>`;
}

export function validateAdxXml(source: string) {
  const errors: string[] = [];
  if (!/<adx\b[^>]*xmlns=["']urn:ihe:qrph:adx:2015["']/i.test(source)) errors.push("Missing IHE ADX namespace.");
  if (!/<group\b/i.test(source)) errors.push("Missing ADX group.");
  if (!/\borgUnit=["'][^"']+["']/i.test(source)) errors.push("Missing organisation unit.");
  if (!/\bdataSet=["'][^"']+["']/i.test(source)) errors.push("Missing data set.");
  if (!/\bperiod=["']\d{4}-\d{2}-\d{2}\/P(?:1M|3M|1Y)["']/i.test(source)) errors.push("Period is not an ISO-8601 ADX interval.");
  const values = source.match(/<dataValue\b[^>]*\/>/gi) ?? [];
  if (!values.length) errors.push("No ADX data values found.");
  values.forEach((tag, index) => {
    if (!/\bdataElement=["'][^"']+["']/i.test(tag)) errors.push(`Data value ${index + 1} has no data element.`);
    if (!/\bvalue=["'][^"']*["']/i.test(tag)) errors.push(`Data value ${index + 1} has no value.`);
  });
  return { valid: errors.length === 0, errors, observationCount: values.length };
}

function sdmxRows(input: SdmxDocumentInput) {
  validateObservations(input.observations);
  return input.observations.map((observation) => ({
    ...(input.defaults ?? {}), ...(observation.dimensions ?? {}),
    INDICATOR: observation.remoteId,
    TIME_PERIOD: input.period,
    OBS_VALUE: String(observation.value),
  }));
}

export function buildSdmxCsv(input: SdmxDocumentInput): string {
  const rows = sdmxRows(input);
  const dimensionKeys = Array.from(new Set(rows.flatMap((row) => Object.keys(row).filter((key) => !["INDICATOR", "TIME_PERIOD", "OBS_VALUE"].includes(key))))).sort();
  const headers = ["DATAFLOW", ...dimensionKeys, "INDICATOR", "TIME_PERIOD", "OBS_VALUE"];
  const dataflow = `${input.agencyId}:${input.dataflowId}(${input.dataflowVersion ?? "1.0"})`;
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csv(header === "DATAFLOW" ? dataflow : row[header] ?? "")).join(","))].join("\n");
}

export function buildSdmxJson(input: SdmxDocumentInput) {
  const rows = sdmxRows(input);
  return JSON.stringify({
    meta: { schema: "https://raw.githubusercontent.com/sdmx-twg/sdmx-json/develop/data-message/tools/schemas/2.0.0/sdmx-json-data-schema.json", prepared: new Date().toISOString() },
    data: { dataflow: { agency: input.agencyId, id: input.dataflowId, version: input.dataflowVersion ?? "1.0" }, observations: rows },
  }, null, 2);
}

export function validateSdmxPayload(source: string, format: "sdmx-json" | "sdmx-csv", requiredDimensions: string[] = []) {
  const errors: string[] = [];
  let count = 0;
  try {
    if (format === "sdmx-json") {
      const parsed = JSON.parse(source);
      const rows = parsed?.data?.observations;
      if (!Array.isArray(rows)) errors.push("Missing SDMX observations array.");
      else {
        count = rows.length;
        rows.forEach((row: Record<string, unknown>, index: number) => {
          for (const key of ["INDICATOR", "TIME_PERIOD", "OBS_VALUE", ...requiredDimensions]) {
            if (row[key] == null || row[key] === "") errors.push(`Observation ${index + 1} is missing ${key}.`);
          }
        });
      }
    } else {
      const lines = source.trim().split(/\r?\n/).filter(Boolean);
      const headers = lines[0]?.split(",").map((value) => value.replace(/^"|"$/g, "")) ?? [];
      for (const key of ["DATAFLOW", "INDICATOR", "TIME_PERIOD", "OBS_VALUE", ...requiredDimensions]) {
        if (!headers.includes(key)) errors.push(`Missing SDMX-CSV column ${key}.`);
      }
      count = Math.max(0, lines.length - 1);
    }
  } catch {
    errors.push("The SDMX payload is not valid JSON.");
  }
  if (count === 0) errors.push("No SDMX observations found.");
  return { valid: errors.length === 0, errors: Array.from(new Set(errors)), observationCount: count };
}
